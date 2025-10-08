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
  RigidBody2D,
  ERigidBody2DType,
  Vec2,
  Color,
} from 'cc';
const { ccclass, property } = _decorator;

enum RopeState {
  SWING, // 摆动
  EXTEND, // 伸长
  RETRACT, // 收回
}

@ccclass('RopeLine')
export class RopeLine extends Component {
  private static active: RopeLine | null = null;

  private g: Graphics = null!;
  private ropeColor: Color = new Color(255, 51, 51, 255);
  private currentLength: number = 70; // 初始线的长度
  private swingAngle: number = 0; // 当前角度（弧度）
  private swingSpeed: number = 1.5; // 摆动速度（弧度/秒）
  private swingRange: number = 0.5; // 最大摆动幅度（弧度）

  private state: RopeState = RopeState.SWING;
  private extendSpeed: number = 100; // 线伸长速度（像素/秒），先调小测试
  private retractSpeed: number = 300; // 线收回速度
  private minLength: number = 70; // 最短长度
  private maxLength: number = 500; // 最长长度，调大一点
  private hit: boolean = false; // 是否碰撞（用于防止多次触发）

  // 在末端预留的像素（如果你的钩子贴图不带绳子，设为 0 即可）
  @property
  hideAtClawPx: number = 0;

  // 像素对齐，避免亚像素导致的“看起来像两根/半透明”抖动
  @property
  pixelSnap: boolean = false;

  @property
  ropeWidth: number = 2;

  // 使用矩形填充绘制绳子（可有效避免“看起来像两根”的抗锯齿伪影）。若关闭则用描边。
  @property
  useQuadFill: boolean = true;

  @property(Node)
  claw: Node = null!; // 在编辑器里拖拽 Claw 节点到这里

  // 是否用“速度追赶”的方式让爪子跟随目标位置（可能产生长度相关的相位差/闪动）
  // 默认关闭：直接 setPosition，确保与绳子的角度/频率完全一致
  @property
  useKinematicChase: boolean = false;

  @property(Node)
  treasure: Node = null!; // 在编辑器里拖拽 Treasure 节点到这里


  onLoad() {
    // 确保全局只保留一个 RopeLine 实例，避免出现“两套绳子+爪子”
    if ((RopeLine as any).active && (RopeLine as any).active.isValid) {
      this.enabled = false;
      this.node.active = false;
      // eslint-disable-next-line no-console
      console.warn('[RopeLine] duplicate instance disabled:', this.node.name);
      return;
    }
    (RopeLine as any).active = this;

    // 用类型获取 UITransform
    let uiTransform = this.node.getComponent(UITransform);
    if (!uiTransform) {
      uiTransform = this.node.addComponent(UITransform);
    }
    uiTransform.setContentSize(400, 600);
    // 确保渲染在 UI 顶层，避免被背景覆盖造成“半透明”的视觉效果
    // 优先级只在同层级比较，这里取一个较大的值
    // @ts-ignore Creator 3.x: priority 在 UITransform 上
    (uiTransform as any).priority = 100;
    // 爪子节点也提高优先级
    const clawUI = this.claw ? this.claw.getComponent(UITransform) : null;
    if (clawUI) {
      // @ts-ignore
      (clawUI as any).priority = 101;
    }

    // siblingIndex
    if (this.node.parent) {
      this.node.setSiblingIndex(this.node.parent.children.length - 1);
    }
    if (this.claw && this.claw.parent) {
      this.claw.setSiblingIndex(this.claw.parent.children.length - 1);
    }

    systemEvent.on(SystemEvent.EventType.TOUCH_START, this.onTouch, this);

    // 不在这里监听碰撞，交给 Claw.ts 处理
  }

  onTouch() {
    if (this.state === RopeState.SWING) {
      this.state = RopeState.EXTEND;
    }
  }

  // 被 Claw.ts 调用，通知碰撞发生
  onClawHit() {
    if (this.state === RopeState.EXTEND && !this.hit) {
      this.hit = true; // 标记一次命中，避免重复触发造成频繁日志/卡顿
      this.state = RopeState.RETRACT;
    }
  }

  start() {
    // 只保留 Rope 节点自身的一个 Graphics；禁用 Rope 全子树内的其它 Graphics（含 Claw）
    let baseG = this.node.getComponent(Graphics);
    if (!baseG) { baseG = this.node.addComponent(Graphics); }
    this.g = baseG;
    const allInTree = this.node.getComponentsInChildren(Graphics);
    for (const comp of allInTree) {
      if (comp !== baseG) { comp.clear(); comp.enabled = false; }
    }

    this.g.lineWidth = Math.max(1, this.ropeWidth);
    this.g.strokeColor.fromHEX('#ff3333'); // 调试用：更鲜明的红色
    this.g.fillColor.fromHEX('#ff3333');   // 填充颜色与描边一致，确保可见

    // 获取 Canvas 节点
    const canvas = this.node.scene.getChildByName('Canvas');
    if (canvas) {
      const canvasUI = canvas.getComponent(UITransform)!;
      const ropePosInCanvas = canvasUI.convertToNodeSpaceAR(this.node.worldPosition);
      const canvasHeight = canvasUI.height;
      // 计算 Rope 到画布底部的距离（向下）
      const ropeToBottom = canvasHeight / 2 + ropePosInCanvas.y;
      this.maxLength = ropeToBottom + 120; // 可超出底部 120
    }

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

    const rb = this.claw ? this.claw.getComponent(RigidBody2D) : null;
    const cur = this.claw ? this.claw.getPosition() : null;

    // 绘制到“理论末端”（x,y），确保与绳子角度/频率完全一致；
    // 末端预留 hideAtClawPx 像素，避免与 Claw 精灵自带的短绳重叠造成“重影/半透明”。
    const targetX = x;
    const targetY = y;
    let endX = targetX;
    let endY = targetY;
    if (this.hideAtClawPx > 0) {
      const dx = targetX;
      const dy = targetY;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const cut = Math.min(this.hideAtClawPx, Math.max(0, len - 1));
        endX = targetX - (dx / len) * cut;
        endY = targetY - (dy / len) * cut;
      }
    }
    if (this.pixelSnap) {
      endX = Math.round(endX);
      endY = Math.round(endY);
    }
    this.g.clear();
    this.g.lineWidth = Math.max(1, this.ropeWidth);

    if (this.useQuadFill) {
      const dxLine = endX;
      const dyLine = endY;
      const lenLine = Math.hypot(dxLine, dyLine);
      if (lenLine > 0) {
        const nx = -dyLine / lenLine;
        const ny = dxLine / lenLine;
        const half = Math.max(1, this.ropeWidth) * 0.5;
        let x1 = nx * half, y1 = ny * half;
        let x2 = -nx * half, y2 = -ny * half;
        let x3 = endX - nx * half, y3 = endY - ny * half;
        let x4 = endX + nx * half, y4 = endY + ny * half;
        if (this.pixelSnap) {
          const snap = (v: number) => {
            const w = Math.max(1, this.ropeWidth);
            return (w % 2 === 1) ? Math.round(v) + 0.5 : Math.round(v);
          };
          x1 = snap(x1); y1 = snap(y1);
          x2 = snap(x2); y2 = snap(y2);
          x3 = snap(x3); y3 = snap(y3);
          x4 = snap(x4); y4 = snap(y4);
        }
        // 用与描边一致的颜色填充（已在 start() 中同步设置 fillColor）
        this.g.moveTo(x1, y1);
        this.g.lineTo(x2, y2);
        this.g.lineTo(x3, y3);
        this.g.lineTo(x4, y4);
        this.g.close();
        this.g.fill();
      }
    } else {
      if (this.pixelSnap) {
        const w = Math.max(1, this.ropeWidth);
        const off = (w % 2 === 1) ? 0.5 : 0;
        this.g.moveTo(0 + off, 0 + off);
        this.g.lineTo(endX + off, endY + off);
      } else {
        this.g.moveTo(0, 0);
        this.g.lineTo(endX, endY);
      }
      this.g.stroke();
    }

    if (this.claw) {
      // 视觉上：直接把 Claw 放到理论末端 (x,y)，消除 1 帧滞后
      const prevX = cur ? cur.x : x;
      const prevY = cur ? cur.y : y;
      this.claw.setPosition(x, y);
      // 物理上：给刚体一个“1 帧到位”的线速度，保证接触事件稳定
      if (rb) {
        const invDt = 1 / Math.max(deltaTime, 1 / 120);
        rb.linearVelocity = new Vec2((x - prevX) * invDt, (y - prevY) * invDt);
      }
      this.claw.angle = (this.swingAngle * 180) / Math.PI - 36;
    }

    // 伸长
    if (this.state === RopeState.EXTEND) {
      this.currentLength += this.extendSpeed * deltaTime;
      if (this.currentLength >= this.maxLength) {
        this.currentLength = this.maxLength;
        this.state = RopeState.RETRACT;
      }
    }

    // 收回
    if (this.state === RopeState.RETRACT) {
      this.currentLength -= this.retractSpeed * deltaTime;
      if (this.currentLength <= this.minLength) {
        this.currentLength = this.minLength;
        this.state = RopeState.SWING;
        // 回到摆动状态时重置命中标记
        this.hit = false;
      }

    }


  }

  onDestroy() {
    if ((RopeLine as any).active === this) {
      (RopeLine as any).active = null;
    }
    systemEvent.off(SystemEvent.EventType.TOUCH_START, this.onTouch, this);
  }
}
