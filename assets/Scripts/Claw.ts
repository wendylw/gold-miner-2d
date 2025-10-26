import { _decorator, Component, Collider2D, IPhysics2DContact, Contact2DType, RigidBody2D } from 'cc';
import { RopeLine } from './RopeLine'; // 导入 RopeLine

const { ccclass } = _decorator;

// 价值映射（名称兜底）
const valOf = (n: string) => {
  if (/MoneyBag/i.test(n)) return 150;
  if (/Stone/i.test(n)) return 10;
  if (/GoldNugget-1/i.test(n)) return 100;
  if (/GoldNugget-2/i.test(n)) return 200;
  if (/GoldNugget-3/i.test(n)) return 500;
  return 0;
};

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
    const ropeLine = this.node.parent.getComponent(RopeLine);
    const hitNode = otherCollider?.node;
    const value = valOf(hitNode?.name || '');
    // 只在绳子伸长且命中“可收集目标”时触发
    if (ropeLine && ropeLine['state'] === 1 && value > 0 && hitNode) {
      // RopeState.EXTEND = 1
      // 把命中的节点与价值传给绳子
      (ropeLine as any).onClawHit(hitNode, value);
    }
  }
}
