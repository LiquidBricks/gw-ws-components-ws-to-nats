import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishComponentRegistration({ message, rootCtx: { natsContext }, routeCtx: { emits } }) {
  const [env, , tenant] = (message?.subject).split('.')

  const subject = createSubject(emits['component_service.cmd.componentAgent.registerComponent.v1']).forPublish()
    .set({ env, tenant })
    .context('gw-ws-components')
    .id(message.agentID)
    .build()

  const payload = { data: { agentID: message.agentID, component: message.data } }
  await natsContext.publish(subject, JSON.stringify(payload))
}
