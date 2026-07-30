import router from "@liquid-bricks/lib-nats-subject/router";
import { path as componentRegisterPath, spec as componentRegisterSpec } from './routes/component_register.js'
import { path as computeResultDonePath, spec as computeResultDoneSpec } from './routes/computeResultDone.js'
import { Codes } from '../codes.js'

export const routes = [
  [componentRegisterPath, componentRegisterSpec],
  [computeResultDonePath, computeResultDoneSpec],
]

export function createWebSocketIngressRouter({
  natsContext,
  diagnostics,
  connectionRegistry,
}) {
  return router({
    tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
    context: { natsContext, diagnostics, connectionRegistry },
  })
    .route({}, { children: routes })
    .default({
      handler: ({ message, rootCtx: { diagnostics } }) => {
        diagnostics.warn(false, Codes.PRECONDITION_INVALID, 'No handler for subject', { subject: message?.subject })
      }
    })
    .error(({ error, message, rootCtx: { diagnostics } }) => {
      diagnostics.warn(false, Codes.PRECONDITION_INVALID, 'gw-ws-components router error', { error, subject: message?.subject })
      return { status: 'errored' }
    })
    .abort(({ message, rootCtx: { diagnostics } }) => {
      diagnostics.debug('gw-ws-components router aborted', { subject: message?.subject })
      return { status: 'aborted' }
    })
}
