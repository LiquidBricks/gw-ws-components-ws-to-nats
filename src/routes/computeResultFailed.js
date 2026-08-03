import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(
  natsEvents['*'].gateway['*'].function_result.evt.component.compute_function_failed.v1['*'],
)
  .forSubscribe()
  .toObject()

export const emits = {
  'component_service.function_result.evt.component.compute_function_failed.v1.data':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function_failed.v1.data,
  'component_service.function_result.evt.component.compute_function_failed.v1.gate':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function_failed.v1.gate,
  'component_service.function_result.evt.component.compute_function_failed.v1.task':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function_failed.v1.task,
}

const emitKeyByType = Object.freeze({
  data: 'component_service.function_result.evt.component.compute_function_failed.v1.data',
  gate: 'component_service.function_result.evt.component.compute_function_failed.v1.gate',
  task: 'component_service.function_result.evt.component.compute_function_failed.v1.task',
})

const computeResultTypes = new Set(Object.keys(emitKeyByType))
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

function isStructuredError(error) {
  return error != null
    && typeof error === 'object'
    && !Array.isArray(error)
    && typeof error.name === 'string'
    && error.name.length > 0
    && typeof error.message === 'string'
    && (!hasOwn(error, 'code') || typeof error.code === 'string' || typeof error.code === 'number')
}

export function validateComputeResultFailed({ message, rootCtx: { diagnostics } }) {
  const data = message?.data

  diagnostics.require(
    data != null && typeof data === 'object' && !Array.isArray(data),
    PRECONDITION_REQUIRED,
    'compute_function_failed payload required',
    { field: 'data' },
  )
  diagnostics.require(
    typeof data.instanceId === 'string' && data.instanceId.length > 0,
    PRECONDITION_REQUIRED,
    'instanceId required for compute_function_failed',
    { field: 'instanceId' },
  )
  diagnostics.require(
    typeof data.name === 'string' && data.name.length > 0,
    PRECONDITION_REQUIRED,
    'name required for compute_function_failed',
    { field: 'name' },
  )
  diagnostics.require(
    typeof data.type === 'string' && data.type.length > 0,
    PRECONDITION_REQUIRED,
    'type required for compute_function_failed',
    { field: 'type' },
  )
  diagnostics.require(
    computeResultTypes.has(data.type),
    PRECONDITION_INVALID,
    'type must be data, gate, or task for compute_function_failed',
    { field: 'type', type: data.type },
  )
  diagnostics.require(
    data.status !== undefined,
    PRECONDITION_REQUIRED,
    'status required for compute_function_failed',
    { field: 'status' },
  )
  diagnostics.require(
    data.status === 'error',
    PRECONDITION_INVALID,
    'status must be error for compute_function_failed',
    { field: 'status', status: data.status },
  )
  diagnostics.require(
    data.stateEdgeStatus === undefined || data.stateEdgeStatus === 'error',
    PRECONDITION_INVALID,
    'stateEdgeStatus must be error when present for compute_function_failed',
    { field: 'stateEdgeStatus', stateEdgeStatus: data.stateEdgeStatus },
  )
  diagnostics.require(
    isStructuredError(data.error),
    PRECONDITION_INVALID,
    'structured error required for compute_function_failed',
    { field: 'error', error: data.error },
  )
  diagnostics.require(
    !hasOwn(data, 'result'),
    PRECONDITION_INVALID,
    'result must be absent from compute_function_failed',
    { field: 'result' },
  )
  diagnostics.require(
    !hasOwn(data, 'resultValue'),
    PRECONDITION_INVALID,
    'resultValue must be absent from compute_function_failed',
    { field: 'resultValue' },
  )
}

async function publishTypedComputeFailure({
  message,
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const data = message?.data ?? {}
  const emitKey = emitKeyByType[data.type]
  if (!emitKey) throw new TypeError('Unsupported compute_function_failed result type: ' + data.type)

  const subject = createSubject(emits[emitKey]).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data }),
  )
}

export const spec = {
  context: { emits },
  pre: [validateComputeResultFailed],
  handler: publishTypedComputeFailure,
}
