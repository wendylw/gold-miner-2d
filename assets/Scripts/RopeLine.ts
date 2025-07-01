import {
  _decorator,
  Component,
  Graphics,
  Node,
  EventTouch,
  Collider2D,
  director,
  systemEvent,
  SystemEvent,
  UITransform,
} from 'cc';
const { ccclass, property } = _decorator;

enum RopeState {
  SWING, // 摆动
  EXTEND, // 伸长
  RETRACT, // 收回
}

@ccclass('RopeLine')
export class RopeLine extends Component {
  private g: Graphics = null!;
  private currentLength: number = 70; // 初始线的长度
  private swingAngle: number = 0; // 当前角度（弧度）
  private swingSpeed: number = 1.5; // 摆动速度（弧度/秒）
  private swingRange: number = 0.5; // 最大摆动幅度（弧度）

  private state: RopeState = RopeState.SWING;
  private extendSpeed: number = 200; // 线伸长速度（像素/秒）
  private retractSpeed: number = 300; // 线收回速度
  private minLength: number = 70; // 最短长度
  private maxLength: number = 300; // 最长长度
  private hit: boolean = false; // 是否碰撞

  @property(Node)
  claw: Node = null!; // 在编辑器里拖拽 Claw 节点到这里

  onLoad() {
    // 用类型获取 UITransform
    let uiTransform = this.node.getComponent(UITransform);
    if (!uiTransform) {
      uiTransform = this.node.addComponent(UITransform);
    }
    uiTransform.setContentSize(400, 600);

    systemEvent.on(SystemEvent.EventType.TOUCH_START, this.onTouch, this);

    // 监听碰撞
    const collider = this.claw.getComponent(Collider2D);
    if (collider) {
      collider.on('onCollisionEnter', this.onClawHit, this);
    }
  }

  onTouch() {
    if (this.state === RopeState.SWING) {
      this.state = RopeState.EXTEND;
    }
  }

  onClawHit() {
    this.hit = true;
  }

  start() {
    this.g = this.getComponent(Graphics)!;
    this.g.lineWidth = 2;
    this.g.strokeColor.fromHEX('#3F3737');

    // 初始化时让 Claw 在绳子末端
    const x = Math.sin(this.swingAngle) * this.currentLength;
    const y = -Math.cos(this.swingAngle) * this.currentLength;
    if (this.claw) {
      this.claw.setPosition(x, y);
    }
  }

  update(deltaTime: number) {
    if (this.state === RopeState.SWING) {
      this.swingAngle = Math.sin(performance.now() * 0.001 * this.swingSpeed) * this.swingRange;
    }
    const x = Math.sin(this.swingAngle) * this.currentLength;
    const y = -Math.cos(this.swingAngle) * this.currentLength;

    this.g.clear();
    this.g.moveTo(0, 0);
    this.g.lineTo(x, y);
    this.g.stroke();

    if (this.claw) {
      this.claw.setPosition(x, y);
      this.claw.angle = (this.swingAngle * 180) / Math.PI - 36;
    }

    // 伸长
    if (this.state === RopeState.EXTEND) {
      this.currentLength += this.extendSpeed * deltaTime;
      if (this.currentLength >= this.maxLength) {
        this.currentLength = this.maxLength;
        this.state = RopeState.RETRACT;
      }
      // 检测碰撞（伪代码，需用实际碰撞检测替换）
      if (this.hit) {
        this.state = RopeState.RETRACT;
      }
    }

    // 收回
    if (this.state === RopeState.RETRACT) {
      this.currentLength -= this.retractSpeed * deltaTime;
      if (this.currentLength <= this.minLength) {
        this.currentLength = this.minLength;
        this.state = RopeState.SWING;
        this.hit = false;
      }
    }
  }

  onDestroy() {
    systemEvent.off(SystemEvent.EventType.TOUCH_START, this.onTouch, this);
  }
}
