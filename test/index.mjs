import test from 'node:test'
import assert from 'node:assert/strict'

import { spec as componentRegisterSpec } from '../src/routes/component_register.js'
import { spec as computeResultSpec } from '../src/routes/computeResultDone.js'

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

test('compute_function results are republished to component service', async () => {
  const publishCalls = []
  const data = {
    instanceId: 'instance-1',
    name: 'taskA',
    type: 'task',
    result: 42,
  }

  await computeResultSpec.handler({
    message: { data },
    rootCtx: {
      natsContext: {
        publish: async (...args) => publishCalls.push(args),
      },
    },
    routeCtx: computeResultSpec.context,
  })

  assert.equal(publishCalls.length, 1)
  const [subject, payload] = publishCalls[0]
  assert.equal(subject, 'prod.component-service._.function_result.evt.component.compute_function.v1.task')
  assert.deepEqual(JSON.parse(payload), { data })
})
