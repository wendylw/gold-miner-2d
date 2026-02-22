import { _decorator, Component, SpriteFrame, Node, Sprite, UITransform, resources, Texture2D } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('NumberDisplay')
export class NumberDisplay extends Component {
  @property([SpriteFrame]) digits: SpriteFrame[] = [];
  @property spacing = 2;
  @property digitWidth = 20;  // 默认数字宽度
  @property digitHeight = 30; // 默认数字高度
  @property scale = 0.3;      // 数字缩放比例

  start() {
    // 如果没有配置 digits，使用默认的纯色方块作为占位符
    if (this.digits.length === 0) {
      console.warn('NumberDisplay: digits 数组为空，将使用默认占位符');
      // 创建 10 个空的 SpriteFrame 作为占位符
      for (let i = 0; i < 10; i++) {
        this.digits.push(null);
      }
    }
  }

  setValue(n: number) {
    const s = Math.max(0, n | 0).toString();
    let xOffset = 0;
    let maxHeight = 0;

    // Create or reuse child sprites per digit
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i) - 48; // '0' = 48
      const child = this.node.children[i] ?? new Node(`digit_${i}`);
      if (!child.parent) {
        this.node.addChild(child);
        // 继承父节点的 layer，确保相机能看到
        child.layer = this.node.layer;
      }

      const uiTransform = child.getComponent(UITransform) ?? child.addComponent(UITransform);
      const sp = child.getComponent(Sprite) ?? child.addComponent(Sprite);

      // 如果有配置的 spriteFrame，使用它
      if (this.digits[code]) {
        sp.spriteFrame = this.digits[code];
        // 使用 spriteFrame 的原始尺寸，并应用缩放
        if (sp.spriteFrame && sp.spriteFrame.originalSize) {
          const size = sp.spriteFrame.originalSize;
          uiTransform.setContentSize(size.width * this.scale, size.height * this.scale);
        } else {
          // 如果无法获取尺寸，使用默认值
          uiTransform.setContentSize(this.digitWidth * this.scale, this.digitHeight * this.scale);
        }
      } else {
        // 否则使用默认大小的纯色方块
        uiTransform.setContentSize(this.digitWidth * this.scale, this.digitHeight * this.scale);
        sp.spriteFrame = null;
      }

      // 先记录宽度，稍后设置位置
      child.active = true;
      xOffset += uiTransform.contentSize.width + this.spacing;
      maxHeight = Math.max(maxHeight, uiTransform.contentSize.height);
    }

    // Hide redundant children
    for (let j = s.length; j < this.node.children.length; j++) {
      this.node.children[j].active = false;
    }

    // 自动调整父节点的 contentSize 以适应所有子节点
    const parentUITransform = this.node.getComponent(UITransform);
    if (parentUITransform && s.length > 0) {
      // 总宽度 = 所有数字宽度 + 间距，减去最后一个间距
      const totalWidth = xOffset - this.spacing;
      parentUITransform.setContentSize(totalWidth, maxHeight);

      // 重新设置子节点位置，从左边开始（考虑父节点的 anchorPoint）
      const parentAnchor = parentUITransform.anchorPoint;
      const startX = -totalWidth * parentAnchor.x;
      let currentX = startX;

      for (let i = 0; i < s.length; i++) {
        const child = this.node.children[i];
        const childUI = child.getComponent(UITransform);
        const childAnchor = childUI.anchorPoint;

        // 子节点位置 = 起始位置 + 子节点宽度的一半（如果 anchorPoint 是 0.5）
        child.setPosition(currentX + childUI.width * childAnchor.x, 0);
        currentX += childUI.width + this.spacing;
      }
    }
  }
}

