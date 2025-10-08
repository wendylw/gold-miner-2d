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
  // 运行时的当前长度与摆动状态
  private currentLength: number = 70;
  private swingAngle: number = 0;
  private swingT: number = 0;

  // 可在 Inspector 调整的参数
  @property
  startLength: number = 70;
  @property
  minLength: number = 70;
  @property
  maxLength: number = 500;
  @property
  extendSpeed: number = 100; // 线伸长速度（像素/秒）
  @property
  retractSpeed: number = 300; // 线收回速度
  @property
  swingSpeed: number = 1.5; // 摆动速度（弧度/秒）
  @property
  swingRange: number = 0.5; // 最大摆幅（弧度）
  @property
  autoComputeMaxLength: boolean = true; // 自动按画布底部计算最大长度
  @property
  extraOvershoot: number = 120; // 超出底部的额外像素

  private state: RopeState = RopeState.SWING;
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

  // 爪子贴图相对于绳子的朝向修正（角度，单位度）
  @property
  clawAngleOffset: number = -36;

  // 调试：是否绘制理论末端和实际爪子位置的小点
  @property
  debugDrawTargets: boolean = false;

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
    this.g.strokeColor.fromHEX('#000000'); // 绳子颜色：黑色
    this.g.fillColor.fromHEX('#000000');   // 填充颜色与描边一致，确保可见

    // 初始化长度
    this.currentLength = this.startLength;

    // 计算最大长度：优先自动根据画布到底部的距离
    const canvas = this.node.scene.getChildByName('Canvas');
    if (canvas) {
      const canvasUI = canvas.getComponent(UITransform)!;
      const ropePosInCanvas = canvasUI.convertToNodeSpaceAR(this.node.worldPosition);
      const canvasHeight = canvasUI.height;
      const ropeToBottom = canvasHeight / 2 + ropePosInCanvas.y; // 向下的距离
      if (this.autoComputeMaxLength) {
        this.maxLength = ropeToBottom + Math.max(0, this.extraOvershoot);
      }
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
      this.swingT += deltaTime;
      this.swingAngle = Math.sin(this.swingT * this.swingSpeed) * this.swingRange;
    }
    const x = Math.sin(this.swingAngle) * this.currentLength;
    const y = -Math.cos(this.swingAngle) * this.currentLength;

    const rb = this.claw ? this.claw.getComponent(RigidBody2D) : null;
    const cur = this.claw ? this.claw.getPosition() : null;

    // 跟随策略：
    // - useKinematicChase=true 且存在刚体 -> 用速度追踪（可能有轻微滞后）
    // - 其它情况 -> 直接设位置，确保与绳端完全重合
    if (this.claw) {
      if (rb && this.useKinematicChase) {
        const invDt = 60; // 用固定物理步长 1/60s，避免不同帧率导致的不同频
        rb.linearVelocity = new Vec2((x - cur!.x) * invDt, (y - cur!.y) * invDt);
      } else {
        if (rb) rb.linearVelocity = new Vec2(0, 0);
        this.claw.setPosition(x, y);
      }
      this.claw.angle = Math.atan2(y, x) * 180 / Math.PI + this.clawAngleOffset;
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
        this.hit = false;
      }
    }
  }

  lateUpdate(deltaTime: number) {
    // 物理步之后再绘制，使用 Claw 的实际位置作为末端
    const cur = this.claw ? this.claw.getPosition() : null;
    const targetX = cur ? cur.x : Math.sin(this.swingAngle) * this.currentLength;
    const targetY = cur ? cur.y : -Math.cos(this.swingAngle) * this.currentLength;

    // 同步一次爪子的朝向（基于最终用于绘制的方向向量）
    if (this.claw) {
      const theta = Math.atan2(targetY, targetX);
      this.claw.angle = theta * 180 / Math.PI + this.clawAngleOffset;
    }

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

    // 调试可视化：红点=理论末端，绿点=Claw 实际位置
    if (this.debugDrawTargets) {
      const saved = new Color(this.g.fillColor.r, this.g.fillColor.g, this.g.fillColor.b, this.g.fillColor.a);
      const r = Math.max(1, Math.min(3, this.ropeWidth * 0.3));
      // 红点（理论目标）
      this.g.fillColor = new Color(255, 60, 60, 255);
      const tx = Math.sin(this.swingAngle) * this.currentLength;
      const ty = -Math.cos(this.swingAngle) * this.currentLength;
      this.g.circle(tx, ty, r);
      this.g.fill();
      // 绿点（实际 claw）
      if (cur) {
        this.g.fillColor = new Color(60, 255, 120, 255);
        this.g.circle(cur.x, cur.y, r);
        this.g.fill();
      }
      // 还原
      this.g.fillColor = saved;
    }
  }

  onDestroy() {
    if ((RopeLine as any).active === this) {
      (RopeLine as any).active = null;
    }
    systemEvent.off(SystemEvent.EventType.TOUCH_START, this.onTouch, this);
  }
}
