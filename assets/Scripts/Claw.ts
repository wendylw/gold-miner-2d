import { _decorator, Component, Collider2D, IPhysics2DContact, Contact2DType, RigidBody2D } from 'cc';
import { RopeLine } from './RopeLine'; // 导入 RopeLine

const { ccclass } = _decorator;

@ccclass('Claw')
export class Claw extends Component {
  onLoad() {
    const collider = this.getComponent(Collider2D);
    const rb = this.getComponent(RigidBody2D);

    if (rb) {
      rb.enabledContactListener = true;
    }

    if (collider) {
      collider.sensor = true; // 推荐设置为传感器
      // 2D 物理请使用 Contact2DType 事件
      collider.on(Contact2DType.BEGIN_CONTACT, this.onClawHit, this);
    }
    // console.log('[Claw] onLoad: collider=', !!collider, 'rb=', !!rb);
  }

  onClawHit(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
    // console.log('Claw hit!', otherCollider.node.name);
    // 只在绳子伸长状态下才处理
    const ropeLine = this.node.parent.getComponent(RopeLine);

    if (ropeLine && ropeLine['state'] === 1) {
      // RopeState.EXTEND = 1
      ropeLine.onClawHit();
    }
  }
}
