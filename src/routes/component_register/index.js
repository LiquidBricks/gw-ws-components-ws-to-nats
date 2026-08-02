import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { validateComponentRegistration } from './handler.js'
import { publishComponentRegistration } from './publishComponentRegistration.js'


export const path = createSubject(natsEvents['*'].component_service['*']['component-agent'].cmd.component.register.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'component_service.cmd.componentAgent.registerComponent.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentAgent.registerComponent.v1['*'],
}

export const spec = {
  context: { emits },
  handler: validateComponentRegistration,
  post: [
    publishComponentRegistration,
  ],
}
