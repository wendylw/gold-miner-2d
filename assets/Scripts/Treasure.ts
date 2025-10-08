import { _decorator, Component, Collider2D, IPhysics2DContact, Contact2DType, RigidBody2D } from 'cc';
const { ccclass } = _decorator;

@ccclass('Treasure')
export class Treasure extends Component {
  onLoad() {
    const collider = this.getComponent(Collider2D);
    const rb = this.getComponent(RigidBody2D);
    // 确保刚体开启接触监听，否则不会派发 2D 碰撞事件
    if (rb) {
      rb.enabledContactListener = true;
    }
    if (collider) {
      collider.on(Contact2DType.BEGIN_CONTACT, this.onTreasureHit, this);
    }
  }

  onTreasureHit(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
    const otherName = otherCollider?.node?.name || '';
    if (otherName !== 'Claw') return; // 只关心爪子
    // console.log('Treasure hit by Claw');
  }
}
