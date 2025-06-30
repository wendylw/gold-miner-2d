import { _decorator, Component, Graphics, Node, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RopeLine')
export class RopeLine extends Component {
    private g: Graphics = null!;
    private currentLength: number = 100; // 初始绳子长度

    start() {
        console.log('this.node:', this.node);
    console.log('this.node.parent:', this.node.parent);

    const anchorUi = this.node.parent?.getComponent(UITransform);
    if (!anchorUi) {
      console.warn('No UITransform on parent node');
    } else {
      const anchorWorldPos = anchorUi.convertToWorldSpaceAR(new Vec3(0, 0, 0));
      console.log('RopeAnchorPoint worldPos:', anchorWorldPos);
    }

        this.g = this.getComponent(Graphics)!;
        this.g.lineWidth = 5;
        this.g.strokeColor.fromHEX('#000000'); // 绳子颜色为黑色
    }

    update(deltaTime: number) {
        this.g.clear();
        this.g.moveTo(0, 0);
        this.g.lineTo(0, -this.currentLength);
        this.g.stroke();
        this.g.fill();
    }

    // 这个方法外部可以调用，动态修改绳子长度
    setLength(len: number) {
        this.currentLength = len;
    }
}
