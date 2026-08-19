import test from 'node:test'
import assert from 'node:assert/strict'

import { routes } from '../src/index.js'
import {
  path,
  spec,
  validateComputeConsoleEvent,
} from '../src/routes/computeConsoleEvent.js'

function createDiagnosticsStub() {
  class DiagnosticError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  }

  return {
    require(value, code, message) {
      if (!value) throw new DiagnosticError(message, code)
    },
  }
}

function validate(data, { method = data.method, instanceId = data.instanceId } = {}) {
  return validateComputeConsoleEvent({
    message: { data },
    info: { params: { action: method, id: instanceId } },
    rootCtx: { diagnostics: createDiagnosticsStub() },
  })
}

test('function_console ingress is a dedicated registered route', () => {
  assert.equal(routes.some(([routePath, routeSpec]) => routePath === path && routeSpec === spec), true)
  assert.deepEqual(path, {
    ns: 'gateway',
    context: 'function_console',
    channel: 'evt',
    entity: 'console',
    version: 'v1',
  })
})

test('function_console ingress publishes a has_log domain fact', async () => {
  const data = {
    instanceId: 'instance-1',
    name: 'inspectContainer',
    type: 'task',
    method: 'error',
    args: ['inspect failed', { code: 125 }],
  }
  const publishCalls = []

  validate(data)
  await spec.handler({
    message: { data },
    rootCtx: {
      natsContext: {
        publish: async (...args) => publishCalls.push(args),
      },
    },
    routeCtx: spec.context,
  })

  assert.equal(publishCalls.length, 1)
  const [subject, payload] = publishCalls[0]
  assert.equal(subject, 'prod.domain._._.edge.has_log.error.v1.instance-1')

  const fact = JSON.parse(payload).data
  const { logId, updatedAt, ...logData } = fact
  assert.deepEqual(logData, data)
  assert.match(logId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.equal(new Date(updatedAt).toISOString(), updatedAt)
})

test('function_console ingress rejects payload context that differs from its path', () => {
  const data = {
    instanceId: 'instance-1',
    name: 'inspectContainer',
    type: 'task',
    method: 'warn',
    args: [],
  }

  assert.throws(
    () => validate(data, { method: 'error' }),
    (error) => error.code === 'PRECONDITION_INVALID',
  )
  assert.throws(
    () => validate(data, { instanceId: 'instance-2' }),
    (error) => error.code === 'PRECONDITION_INVALID',
  )
  assert.throws(
    () => validate({ ...data, args: 'not-an-array' }),
    (error) => error.code === 'PRECONDITION_INVALID',
  )
})
