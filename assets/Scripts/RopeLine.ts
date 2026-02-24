import {
  _decorator,
  Component,
  Graphics,
  Node,
  EventTouch,
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
  private hit: boolean = false; // 是否已命中（用于防止多次触发）
  private pendingRetractLength: number | null = null; // 命中后需要继续伸入到的长度

  // 命中后继续向内“深入”的像素，达到后再开始收回（近似爪子半径/高度）
  @property
  hitDepthPx: number = 20;

  // 在末端预留的像素（如果你的钩子贴图不带绳子，设为 0 即可）
  @property
  hideAtClawPx: number = 0;


  // 抓取归属：命中后被抓住的宝物及其价值、弹出控制与总金额
  private heldNode: Node | null = null;
  private heldValue: number = 0;
  private heldWeight: number = 1;
  private popupShown: boolean = false;
  public totalMoney: number = 0;

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

  // 被 Claw.ts 调用，通知碰撞发生（携带命中节点与其价值）
  onClawHit(node?: Node, val?: number, weight?: number) {
    if (this.state === RopeState.EXTEND && !this.hit) {
      this.hit = true; // 记录命中一次
      // 记录需要”深入”到的目标长度，达到后再开始收回
      const target = Math.min(this.maxLength, this.currentLength + Math.max(0, this.hitDepthPx));
      this.pendingRetractLength = target;
      if (node && typeof val === 'number') {
        this.heldNode = node;
        this.heldValue = val;
        this.heldWeight = weight ?? 1;
      }
    }
  }

  onEnable() {
    // 再保险：启用时立即初始化一次，并在下一帧再设一次，避免资源加载顺序导致初始不显示
    this.updateHudTotal(this.totalMoney);
    this.scheduleOnce(() => this.updateHudTotal(this.totalMoney), 0);
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
    // 初始化 HUD 数字显示为 0
    this.updateHudTotal(this.totalMoney);

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

      // 命中后达到“深入长度”再开始收回
      if (this.hit && this.pendingRetractLength != null && this.currentLength >= this.pendingRetractLength) {
        this.state = RopeState.RETRACT;
      }

      if (this.currentLength >= this.maxLength) {
        this.currentLength = this.maxLength;
        this.state = RopeState.RETRACT;
      }
    }

    // 收回（重量越大速度越慢）
    if (this.state === RopeState.RETRACT) {
      const effectiveSpeed = this.retractSpeed / this.heldWeight;
      this.currentLength -= effectiveSpeed * deltaTime;
      if (this.currentLength <= this.minLength) {
        this.currentLength = this.minLength;
        this.state = RopeState.SWING;
        this.hit = false;
        this.pendingRetractLength = null; //   Reset delay-after-hit target
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

    // 命中后的宝物跟随爪子（沿绳子方向偏移，让爪子夹在物体顶部而非中心）
    if (this.heldNode && this.claw) {
      const clawWP = this.claw.worldPosition;
      const ropeWP = this.node.worldPosition;
      const dirX = clawWP.x - ropeWP.x;
      const dirY = clawWP.y - ropeWP.y;
      const dirLen = Math.hypot(dirX, dirY);
      if (dirLen > 0) {
        const nx = dirX / dirLen;
        const ny = dirY / dirLen;
        // 按物体实际大小动态偏移：大物体多偏移，小物体少偏移
        const heldUI = this.heldNode.getComponent(UITransform);
        const heldScale = Math.abs(this.heldNode.scale.x);
        const halfSize = heldUI ? Math.max(heldUI.width, heldUI.height) * heldScale * 0.5 : 0;
        const tipOffset = halfSize * 0.75;
        this.heldNode.setWorldPosition(clawWP.x + nx * tipOffset, clawWP.y + ny * tipOffset, 0);
      } else {
        this.heldNode.setWorldPosition(clawWP.x, clawWP.y, 0);
      }
    }

    // 在收回阶段接近顶部时弹出金额
    if (this.state === RopeState.RETRACT) {
      const trigger = this.minLength + 50;
      if (!this.popupShown && this.heldValue > 0 && this.currentLength <= trigger) {
        this.popupShown = true;
        this.showPopupAtMid(this.heldValue);
      }
    }

    // 收回完成后（状态回到 SWING），结算：累计 HUD、销毁宝物、清理状态
    if (this.state === RopeState.SWING && (this.heldNode || this.heldValue > 0)) {
      if (this.heldValue > 0) {
        this.totalMoney += this.heldValue;
        this.updateHudTotal(this.totalMoney);
      }
      if (this.heldNode) this.heldNode.destroy();
      this.heldNode = null;
      this.heldValue = 0;
      this.heldWeight = 1;
      this.popupShown = false;
      this.pendingRetractLength = null;
      this.hit = false;
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

  // 递归在指定根节点下查找名字为 name 的子节点（宽松类型以兼容 Scene/Node）
  private findChildDeep(root: any, name: string): any {
    if (!root) return null;
    if (root.name === name) return root;
    const children: any[] = root.children || [];
    for (const ch of children) {
      const r = this.findChildDeep(ch, name);
      if (r) return r;
    }
    return null;
  }

  // 计算弹出金额的位置：先取 CurrentAssets 与 CurrentTarget 的中点，再与 MinerBackground 的中点
  private getPopupPos() {
    const canvas = this.node.scene.getChildByName('Canvas');
    if (!canvas) return this.node.worldPosition.clone();
    const a = this.findChildDeep(canvas, 'CurrentAssets');
    const t = this.findChildDeep(canvas, 'CurrentTarget');
    const m = this.findChildDeep(canvas, 'MinerBackground');
    if (!a || !t || !m) return this.node.worldPosition.clone();
    const p12 = a.worldPosition.clone().add(t.worldPosition).multiplyScalar(0.5);
    return p12.add(m.worldPosition).multiplyScalar(0.5);
  }

  // 在指定位置短暂显示本次宝物金额
  private showPopupAtMid(v: number) {
    const canvas = this.node.scene.getChildByName('Canvas');
    if (!canvas) return;
    const popup = this.findChildDeep(canvas, 'PopupMoney');
    if (!popup) return;
    const pos = this.getPopupPos();
    popup.setWorldPosition(pos.x, pos.y, pos.z);
    popup.active = true;
    const comp: any = (popup as any).getComponent && (popup as any).getComponent('NumberDisplay');
    if (comp && typeof comp.setValue === 'function') comp.setValue(v);
    this.scheduleOnce(() => { popup.active = false; }, 0.8);
  }

  // 更新左上角总金额数字
  private updateHudTotal(n: number) {
    const canvas = this.node.scene.getChildByName('Canvas');
    if (!canvas) return;
    const hud = this.findChildDeep(canvas, 'MoneyTotal');
    const comp: any = hud ? (hud as any).getComponent && (hud as any).getComponent('NumberDisplay') : null;
    if (comp && typeof comp.setValue === 'function') comp.setValue(n);
  }

  onDestroy() {
    if ((RopeLine as any).active === this) {
      (RopeLine as any).active = null;
    }
    systemEvent.off(SystemEvent.EventType.TOUCH_START, this.onTouch, this);
  }
}
