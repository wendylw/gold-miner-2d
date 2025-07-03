import { _decorator, Component, Collider2D, IPhysics2DContact } from 'cc';
const { ccclass } = _decorator;

@ccclass('Treasure')
export class Treasure extends Component {
  onLoad() {
    const collider = this.getComponent(Collider2D);
    if (collider) {
      collider.on('onCollisionEnter', this.onTreasureHit, this);
    }
  }

  onTreasureHit(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
    console.log('Treasure hit!', otherCollider.node.name);
  }
}
