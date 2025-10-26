import { _decorator, Component, SpriteFrame, Node, Sprite } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('NumberDisplay')
export class NumberDisplay extends Component {
  @property([SpriteFrame]) digits: SpriteFrame[] = [];
  @property spacing = 2;

  setValue(n: number) {
    const s = Math.max(0, n | 0).toString();
    // Create or reuse child sprites per digit
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i) - 48; // '0' = 48
      const child = this.node.children[i] ?? new Node();
      if (!child.parent) this.node.addChild(child);
      const sp = child.getComponent(Sprite) ?? child.addComponent(Sprite);
      sp.spriteFrame = this.digits[code];
      const w = sp.spriteFrame ? (sp.spriteFrame.width || 20) : 20;
      child.setPosition(i * (w + this.spacing), 0);
      child.active = true;
    }
    // Hide redundant children
    for (let j = s.length; j < this.node.children.length; j++) {
      this.node.children[j].active = false;
    }
  }
}

