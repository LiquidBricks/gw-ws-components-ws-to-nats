import test from 'node:test'
import assert from 'node:assert/strict'

import { routes } from '../src/index.js'
import { spec as componentRegisterSpec } from '../src/routes/component_register/index.js'
import {
  path as computeResultDonePath,
  spec as computeResultDoneSpec,
} from '../src/routes/computeResultDone.js'
import {
  path as computeResultFailedPath,
  spec as computeResultFailedSpec,
} from '../src/routes/computeResultFailed.js'

function createDiagnosticsStub() {
  const calls = { require: [] }

  class DiagnosticError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  }

  return {
    calls,
    DiagnosticError,
    require(value, code, message, meta) {
      calls.require.push({ value, code, message, meta })
      if (!value) throw new DiagnosticError(message, code)
    },
  }
}

test('provided and failed compute_function ingress use distinct registered routes and emits', () => {
  assert.equal(routes.some(([path, spec]) => path === computeResultDonePath && spec === computeResultDoneSpec), true)
  assert.equal(routes.some(([path, spec]) => path === computeResultFailedPath && spec === computeResultFailedSpec), true)
  assert.notDeepEqual(computeResultDonePath, computeResultFailedPath)
  assert.deepEqual(Object.keys(computeResultDoneSpec.context.emits), [
    'component_service.function_result.evt.component.compute_function.v1.data',
    'component_service.function_result.evt.component.compute_function.v1.gate',
    'component_service.function_result.evt.component.compute_function.v1.task',
  ])
  assert.deepEqual(Object.keys(computeResultFailedSpec.context.emits), [
    'component_service.function_result.evt.component.compute_function_failed.v1.data',
    'component_service.function_result.evt.component.compute_function_failed.v1.gate',
    'component_service.function_result.evt.component.compute_function_failed.v1.task',
  ])
  assert.equal(
    Object.keys(computeResultFailedSpec.context.emits).some((key) =>
      key.includes('.compute_function.v1.')),
    false,
  )
})

function validateRoutePayload(spec, data) {
  const diagnostics = createDiagnosticsStub()
  spec.pre[0]({ message: { data }, rootCtx: { diagnostics } })
  return diagnostics
}

function assertInvalidRoutePayload(spec, data, expectedCode) {
  assert.throws(
    () => validateRoutePayload(spec, data),
    (error) => error.code === expectedCode,
  )
}

test('component registration is validated and published to NATS', async () => {
  const agentID = 'agent-1'
  const connectionRegistry = new Map([
    [agentID, { publish() {}, providedComponentHashes: new Set() }],
  ])
  const diagnostics = createDiagnosticsStub()
  const message = {
    agentID,
    data: { hash: 'hash-abc' },
    subject: 'prod.component-service.tenant.component-agent.cmd.component.register.v1.conn-1',
  }

  const scope = await componentRegisterSpec.handler({
    message,
    rootCtx: { connectionRegistry, diagnostics },
  })

  assert.equal(connectionRegistry.get(agentID).providedComponentHashes.size, 0)
  assert.deepEqual(scope, { hash: 'hash-abc', agentID })

  const publishCalls = []
  await componentRegisterSpec.post[0]({
    message,
    scope,
    rootCtx: { natsContext: { publish: async (...args) => publishCalls.push(args) } },
    routeCtx: componentRegisterSpec.context,
  })

  assert.equal(publishCalls.length, 1)
  const [subject, payload] = publishCalls[0]
  assert.equal(
    subject,
    'prod.component-service.tenant.gw-ws-components.cmd.componentAgent.registerComponent.v1.' + agentID,
  )
  assert.deepEqual(JSON.parse(payload), { data: { agentID, component: message.data } })
})

test('provided compute_function results preserve status when republished to component service', async () => {
  const publishCalls = []
  const data = {
    instanceId: 'instance-1',
    name: 'taskA',
    type: 'task',
    result: 42,
    status: 'provided',
  }

  validateRoutePayload(computeResultDoneSpec, data)

  await computeResultDoneSpec.handler({
    message: { data },
    rootCtx: {
      natsContext: {
        publish: async (...args) => publishCalls.push(args),
      },
    },
    routeCtx: computeResultDoneSpec.context,
  })

  assert.equal(publishCalls.length, 1)
  const [subject, payload] = publishCalls[0]
  assert.equal(subject, 'prod.component-service._.function_result.evt.component.compute_function.v1.task')
  assert.deepEqual(JSON.parse(payload), { data })
})

test('failed compute_function events preserve no-result errors for every typed subject', async () => {
  const publishCalls = []
  const error = {
    name: 'Error',
    message: 'compute failed',
    code: 'COMPUTE_FAILED',
  }

  for (const type of ['data', 'gate', 'task']) {
    const data = {
      instanceId: 'instance-' + type,
      name: type + 'A',
      type,
      status: 'error',
      error,
    }

    validateRoutePayload(computeResultFailedSpec, data)

    await computeResultFailedSpec.handler({
      message: { data },
      rootCtx: {
        natsContext: {
          publish: async (...args) => publishCalls.push(args),
        },
      },
      routeCtx: computeResultFailedSpec.context,
    })
  }

  assert.equal(publishCalls.length, 3)
  for (const [index, type] of ['data', 'gate', 'task'].entries()) {
    const [subject, payload] = publishCalls[index]
    assert.equal(subject, `prod.component-service._.function_result.evt.component.compute_function_failed.v1.${type}`)
    assert.deepEqual(JSON.parse(payload), {
      data: {
        instanceId: 'instance-' + type,
        name: type + 'A',
        type,
        status: 'error',
        error,
      },
    })
  }
})

test('provided compute_function validation accepts only provided result payloads', () => {
  const valid = {
    instanceId: 'instance-1',
    name: 'taskA',
    type: 'task',
    status: 'provided',
    result: null,
  }

  validateRoutePayload(computeResultDoneSpec, valid)

  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, instanceId: '' },
    'PRECONDITION_REQUIRED',
  )
  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, name: '' },
    'PRECONDITION_REQUIRED',
  )
  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, type: 'unknown' },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, status: 'error' },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, stateEdgeStatus: 'error' },
    'PRECONDITION_INVALID',
  )
  const { result: _result, ...withoutResult } = valid
  assertInvalidRoutePayload(computeResultDoneSpec, withoutResult, 'PRECONDITION_REQUIRED')
  assertInvalidRoutePayload(
    computeResultDoneSpec,
    { ...valid, error: { name: 'Error', message: 'should not be here' } },
    'PRECONDITION_INVALID',
  )
})

test('failed compute_function validation rejects every result property, including null', () => {
  const valid = {
    instanceId: 'instance-1',
    name: 'taskA',
    type: 'task',
    status: 'error',
    error: { name: 'Error', message: 'compute failed', code: 'COMPUTE_FAILED' },
  }

  validateRoutePayload(computeResultFailedSpec, valid)

  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, instanceId: '' },
    'PRECONDITION_REQUIRED',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, name: '' },
    'PRECONDITION_REQUIRED',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, type: 'unknown' },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, status: 'provided' },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, stateEdgeStatus: 'provided' },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, error: { name: '', message: 'compute failed' } },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, result: null },
    'PRECONDITION_INVALID',
  )
  assertInvalidRoutePayload(
    computeResultFailedSpec,
    { ...valid, resultValue: null },
    'PRECONDITION_INVALID',
  )
})
