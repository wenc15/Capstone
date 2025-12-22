// ui/js/ballPositioner.js
// 12.20 created by Jingyao Sun:
// 负责把 ballWin 放到“旧内置球”的位置（相对主窗口）

function placeBallAtOldWidgetSpot(mainWin, ballWin, opts = {}) {
  if (!mainWin || !ballWin) return;

  const {
    innerLeft = 100,
    innerTop = 600,
    innerSize = 80,
    centerAlign = true,
  } = opts;

  const main = mainWin.getBounds();
  const ball = ballWin.getBounds();

  let x = Math.round(main.x + innerLeft);
  let y = Math.round(main.y + innerTop);

  if (centerAlign) {
    x = Math.round(main.x + innerLeft + innerSize / 2 - ball.width / 2);
    y = Math.round(main.y + innerTop + innerSize / 2 - ball.height / 2);
  }

  ballWin.setPosition(x, y, false);
}

module.exports = { placeBallAtOldWidgetSpot };
