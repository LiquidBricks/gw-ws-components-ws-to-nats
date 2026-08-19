import { randomUUID } from 'node:crypto'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(
  natsEvents['*'].gateway['*'].function_console.evt.console['*'].v1['*'],
)
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.has_log.*.v1.*':
    natsEvents['*'].domain['*']['*'].edge.has_log['*'].v1['*'],
}

const emitKey = 'domain.edge.has_log.*.v1.*'
const computeFunctionTypes = new Set(['data', 'gate', 'task'])

export function validateComputeConsoleEvent({ message, info, rootCtx: { diagnostics } }) {
  const data = message?.data

  diagnostics.require(
    data != null && typeof data === 'object' && !Array.isArray(data),
    PRECONDITION_REQUIRED,
    'function_console payload required',
    { field: 'data' },
  )
  diagnostics.require(
    typeof data.instanceId === 'string' && data.instanceId.length > 0,
    PRECONDITION_REQUIRED,
    'instanceId required for function_console',
    { field: 'instanceId' },
  )
  diagnostics.require(
    typeof data.name === 'string' && data.name.length > 0,
    PRECONDITION_REQUIRED,
    'name required for function_console',
    { field: 'name' },
  )
  diagnostics.require(
    computeFunctionTypes.has(data.type),
    PRECONDITION_INVALID,
    'type must be data, gate, or task for function_console',
    { field: 'type', type: data.type },
  )
  diagnostics.require(
    typeof data.method === 'string' && data.method.length > 0,
    PRECONDITION_REQUIRED,
    'method required for function_console',
    { field: 'method' },
  )
  diagnostics.require(
    Array.isArray(data.args),
    PRECONDITION_INVALID,
    'args must be an array for function_console',
    { field: 'args' },
  )
  diagnostics.require(
    info?.params?.action === data.method,
    PRECONDITION_INVALID,
    'function_console method must match event path',
    { field: 'method', method: data.method, action: info?.params?.action },
  )
  diagnostics.require(
    info?.params?.id === data.instanceId,
    PRECONDITION_INVALID,
    'function_console instanceId must match event path',
    { field: 'instanceId', instanceId: data.instanceId, id: info?.params?.id },
  )
}

export async function publishComputeConsoleFact({
  message,
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const data = message.data
  const fact = {
    ...data,
    logId: randomUUID(),
    updatedAt: new Date().toISOString(),
  }
  const subject = createSubject(emits[emitKey]).forPublish()
    .env('prod')
    .action(data.method)
    .id(data.instanceId)

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: fact }),
  )
}

export const spec = {
  context: { emits },
  pre: [validateComputeConsoleEvent],
  handler: publishComputeConsoleFact,
}
