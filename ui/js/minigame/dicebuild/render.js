// 2026/03/24 edited by Zhecheng Xu
// Changes:
// - Refined hover-card stability and content rendering.
// - Added rarity/tag visual helpers and roll warning UI.
// - Updated max-level display/EXP presentation rules.
//
// dicebuild/render.js
// Render and lightweight UI helper logic for Dice & Build.

export function createDiceBuildRender({
  BUILDINGS,
  RARITY,
  STAGE_COUNT,
  ROLLS_PER_STAGE,
  TOTAL_ROLLS,
  BUY_BLOCK_COSTS,
  idxOf,
  isLockedUsable,
  isFoundationKind,
  canRoll,
  sellValue,
  expReqForNext,
  clamp,
}) {
  function diceFaceSrc(n) {
    const v = Math.max(1, Math.min(6, Number(n || 1)));
    return `assets/dice/${v}.png`;
  }

  function renderLastRoll(els, st) {
    const el = els?.mgLastRoll;
    if (!el) return;

    const dice = Array.isArray(st?.lastDice) ? st.lastDice : null;
    if (!dice || !dice.length) {
      el.textContent = '';
      return;
    }

    el.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'mg-dice-row';
    dice.forEach((face) => {
      const n = Math.max(1, Math.min(6, Number(face || 1)));
      const wrap = document.createElement('div');
      wrap.className = 'mg-die-wrap';

      const img = document.createElement('img');
      img.className = 'mg-die-face';
      img.alt = `dice ${n}`;
      img.src = diceFaceSrc(n);

      const num = document.createElement('span');
      num.className = 'mg-die-num';
      num.textContent = String(n);

      wrap.appendChild(img);
      wrap.appendChild(num);
      row.appendChild(wrap);
    });

    el.appendChild(row);
  }

  function rarityLabel(r) {
    const rar = RARITY[r || 'common'] || RARITY.common;
    return rar.label;
  }

  function rarityColor(r) {
    const rar = RARITY[r || 'common'] || RARITY.common;
    return rar.color;
  }

  function formatBuildingEffect(def, level, inst = null) {
    const raw = String(def?.effectText || '').trim();
    const lv = Math.max(1, Number(level || 1));
    const bonus = Math.max(0, Math.round(Number(inst?.coinMod || 0)));
    const sellBonus = Array.isArray(def?.sellBonusByLevel)
      ? (def.sellBonusByLevel[Math.max(0, Math.min(3, lv - 1))] ?? 0)
      : 0;
    let text = raw
      .replaceAll('{L}', String(lv))
      .replaceAll('{L1}', String(lv + 1))
      .replaceAll('{2L}', String(2 * lv))
      .replaceAll('{5L}', String(5 * lv))
      .replaceAll('{6L}', String(6 * lv))
      .replaceAll('{SB}', String(sellBonus));

    if (bonus > 0) {
      text = text.replace(/gain\s+(\d+)\s+Coins/g, (m, n) => `gain ${n}+${bonus} Coins`);

      text = text
        .replace(/gain Coins equal to \(([^)]+)\)\./g, `gain Coins equal to ($1 + ${bonus}).`)
        .replace(/gain Coins equal to \(([^)]+)\)/g, `gain Coins equal to ($1 + ${bonus})`);
    }

    text = text
      .replaceAll('Coin buildings', '💰buildings')
      .replaceAll('Coin building', '💰building')
      .replaceAll('coin buildings', '💰buildings')
      .replaceAll('coin building', '💰building')
      .replaceAll('Dice buildings', '🎲buildings')
      .replaceAll('Dice building', '🎲building')
      .replaceAll('dice buildings', '🎲buildings')
      .replaceAll('dice building', '🎲building');

    const normalized = text
      .replaceAll('. When ', '.\nWhen ')
      .replaceAll('. At ', '.\nAt ')
      .replaceAll('. Each ', '.\nEach ')
      .replaceAll('. If ', '.\nIf ');

    const lines = String(normalized)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `• ${line}`);

    return lines.length ? lines.join('\n') : '—';
  }

  function typeEmoji(tag) {
    if (tag === 'Coin') return '💰';
    if (tag === 'Dice') return '🎲';
    if (tag === 'Utility') return '⬆️';
    return '🏷️';
  }

  function rarityClass(rarity) {
    const r = String(rarity || 'common').toLowerCase();
    if (r === 'legendary') return 'is-rarity-legendary';
    if (r === 'epic') return 'is-rarity-epic';
    if (r === 'rare') return 'is-rarity-rare';
    return 'is-rarity-common';
  }

  function ensureHoverCard(ui) {
    if (!ui?.mgRoot) return null;
    let el = ui.mgRoot.querySelector('.mg-hover-card');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'mg-hover-card mg-hidden';
    ui.mgRoot.appendChild(el);
    return el;
  }

  function hideHoverCard(ui) {
    const el = ui?.mgRoot?.querySelector('.mg-hover-card');
    if (!el) return;
    el.style.visibility = '';
    el.classList.add('mg-hidden');
  }

  function showHoverCard(ui, payload, anchorEl) {
    if (!ui?.mgRoot || !payload || !anchorEl) return;
    const card = ensureHoverCard(ui);
    if (!card) return;

    const level = Math.max(1, Number(payload.level || 1));
    const isMaxLevel = level >= 4;
    const expNowRaw = Math.max(0, Math.round(Number(payload.exp || 0)));
    const expNow = isMaxLevel ? 16 : expNowRaw;
    const expReq = isMaxLevel ? 16 : expReqForNext(level);
    const expPct = expReq > 0 ? clamp(Math.round((expNow / expReq) * 100), 0, 100) : 0;
    const showExp = !!payload.showExp;
    const rareColor = rarityColor(payload.rarity);

    const tags = Array.isArray(payload.tags) && payload.tags.length
      ? payload.tags
      : (payload.tag ? [payload.tag] : []);
    const typeBadges = tags.map((tag) => `<span class="mg-hover-badge">${typeEmoji(tag)} ${tag}</span>`).join('');
    const hoverSell = payload.inst
      ? sellValue(payload.inst)
      : (() => {
        const idx = clamp(level - 1, 0, 3);
        const byDef = Array.isArray(payload?.def?.sellByLevel) ? payload.def.sellByLevel : null;
        if (byDef && byDef[idx] != null) return byDef[idx];
        const rar = RARITY[payload?.rarity || payload?.def?.rarity || 'common'] || RARITY.common;
        return Array.isArray(rar.sell) ? (rar.sell[idx] ?? rar.sell[0] ?? 0) : 0;
      })();

    const anchorKey = anchorEl.getAttribute('data-idx')
      || anchorEl.getAttribute('data-slot')
      || '';
    const hoverKey = [
      payload.defId || payload.name || '',
      level,
      expNow,
      expReq,
      showExp ? 1 : 0,
      payload.rarity || '',
      hoverSell,
      Number(payload?.inst?.coinMod || 0),
      anchorKey,
    ].join('|');

    if (card.dataset.hoverKey !== hoverKey) {
      card.dataset.hoverKey = hoverKey;
      card.innerHTML = `
        <div class="mg-hover-sell">💵 ${hoverSell}</div>
        <div class="mg-hover-icon">${payload.icon || '🏗️'}</div>
        <div class="mg-hover-title">${payload.name || payload.defId || 'Building'}</div>
        <div class="mg-hover-badges">
          <span class="mg-hover-badge" style="background:${rareColor}22;border-color:${rareColor}55;">${rarityLabel(payload.rarity)}</span>
          ${typeBadges}
        </div>
        <div class="mg-hover-level">${isMaxLevel ? 'Level MAX' : `Level ${level}/4`}${showExp ? `<span class="mg-hover-exp-text">${expNow}/${expReq} EXP</span>` : ''}</div>
        ${showExp ? `<div class="mg-hover-expbar"><div class="mg-hover-expfill" style="width:${expPct}%"></div></div>` : ''}
        <div class="mg-hover-effect">${formatBuildingEffect(payload.def, level, payload.inst)}</div>
      `;
    }

    const rootRect = ui.mgRoot.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const wasHidden = card.classList.contains('mg-hidden');
    if (wasHidden) {
      card.classList.remove('mg-hidden');
      card.style.visibility = 'hidden';
    }

    const cardW = 196;
    const cardH = Math.max(120, card.offsetHeight || 0);
    const gap = 10;

    let left = anchorRect.right - rootRect.left + gap;
    let top = anchorRect.top - rootRect.top;

    if (payload.preferLeft) {
      left = anchorRect.left - rootRect.left - cardW - gap;
      top = anchorRect.top - rootRect.top + ((anchorRect.height - cardH) * 0.5);
      if (left < 6) {
        left = anchorRect.right - rootRect.left + gap;
      }
    } else if (payload.preferTop) {
      left = anchorRect.left - rootRect.left + ((anchorRect.width - cardW) / 2);
      top = anchorRect.top - rootRect.top - gap - cardH;
      if (top < 8) {
        top = anchorRect.bottom - rootRect.top + gap;
      }
    } else if (left + cardW > rootRect.width - 6) {
      left = anchorRect.left - rootRect.left - cardW - gap;
    }

    left = clamp(left, 6, Math.max(6, rootRect.width - cardW - 6));
    top = clamp(top, 8, Math.max(8, rootRect.height - cardH - 8));

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.style.visibility = '';
    card.classList.remove('mg-hidden');
  }

  function showBuildingDetail(ui, st, inst, cellIdx) {
    if (!ui?.mgDetail) return;
    const def = BUILDINGS[inst.defId] || {};
    ui.mgDetail.classList.remove('mg-hidden');

    if (ui.mgDetailIcon) ui.mgDetailIcon.textContent = def.icon || '🏗️';
    if (ui.mgDetailName) ui.mgDetailName.textContent = def.name || inst.defId;

    if (ui.mgDetailRarity) {
      ui.mgDetailRarity.textContent = rarityLabel(def.rarity);
      ui.mgDetailRarity.style.background = `${rarityColor(def.rarity)}22`;
      ui.mgDetailRarity.style.borderColor = `${rarityColor(def.rarity)}55`;
    }

    const tags = Array.isArray(def.tags) && def.tags.length ? def.tags : [];
    if (ui.mgDetailTag) {
      ui.mgDetailTag.textContent = tags.length
        ? tags.map((tag) => `${typeEmoji(tag)} ${tag}`).join(' / ')
        : '—';
    }

    const isMaxLevel = Number(inst.level || 1) >= 4;
    const req = isMaxLevel ? 16 : expReqForNext(inst.level || 1);
    const cur = isMaxLevel ? 16 : Math.max(0, Math.round(inst.exp || 0));

    if (ui.mgDetailLevel) ui.mgDetailLevel.textContent = isMaxLevel ? 'Level MAX' : `Level ${inst.level}/4`;
    if (ui.mgDetailExp) ui.mgDetailExp.textContent = `${cur}/${req} EXP`;
    if (ui.mgDetailExpFill) {
      const pct = req > 0 ? clamp(Math.round((cur / req) * 100), 0, 100) : 0;
      ui.mgDetailExpFill.style.width = `${pct}%`;
    }

    const effect = formatBuildingEffect(def, inst.level || 1, inst);
    if (ui.mgDetailEffect) ui.mgDetailEffect.textContent = effect || '—';

    const val = sellValue(inst);
    if (ui.mgDetailSell) ui.mgDetailSell.textContent = `Sell 💰 ${val}`;
  }

  function hideBuildingDetail(ui) {
    ui?.mgDetail?.classList.add('mg-hidden');
  }

  function hideResult(ui) {
    ui?.mgResult?.classList.add('mg-hidden');
  }

  function showResult(ui, st, score) {
    if (!ui?.mgResult) return;
    ui.mgResult.classList.remove('mg-hidden');
    if (ui.mgResultTitle) ui.mgResultTitle.textContent = score.win ? 'Victory' : 'Defeat';
    const meta = `Score: ${score.value} · Cash: ${st.cash} · Stage: ${st.stageIdx + 1}/${STAGE_COUNT}`;
    if (ui.mgResultMeta) ui.mgResultMeta.textContent = meta;
  }

  function showFloat(ui, text) {
    const el = ui?.mgFloat;
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  function playStageClearCelebration(ui) {
    const root = ui?.mgRoot;
    if (!root) return;

    const layer = document.createElement('div');
    layer.className = 'mg-confetti-layer';
    root.appendChild(layer);

    const pieces = [];
    const g = 980; // px/s^2
    const emissionDuration = 950; // ms
    const ttl = 1950; // ms
    const maxRate = 56; // pieces / sec
    const minRate = 6; // pieces / sec
    const maxPieces = 42;
    let spawnBudget = 0;

    const spawnPiece = (now) => {
      const piece = document.createElement('span');
      piece.className = 'mg-confetti-piece';
      piece.style.left = `${2 + Math.round(Math.random() * 96)}%`;
      piece.style.background = `hsl(${Math.round(Math.random() * 360)} 85% 60%)`;
      layer.appendChild(piece);

      const dir = Math.random() < 0.5 ? -1 : 1;
      pieces.push({
        el: piece,
        born: now,
        life: 880 + Math.random() * 520,
        x: 0,
        y: -(Math.random() * 10),
        vx: dir * (30 + Math.random() * 105),
        vy: -(28 + Math.random() * 92),
        rot: 0,
        vr: dir * (110 + Math.random() * 260),
      });
    };

    let prev = performance.now();
    const start = prev;

    function frame(now) {
      const dt = Math.max(0.001, (now - prev) / 1000);
      prev = now;
      const elapsed = now - start;

      if (elapsed < emissionDuration && pieces.length < maxPieces) {
        const p = elapsed / emissionDuration;
        const decay = Math.pow(1 - p, 1.35);
        const rate = minRate + ((maxRate - minRate) * decay);
        spawnBudget += rate * dt;
        while (spawnBudget >= 1 && pieces.length < maxPieces) {
          spawnPiece(now);
          spawnBudget -= 1;
        }
      }

      for (let i = pieces.length - 1; i >= 0; i -= 1) {
        const p = pieces[i];
        p.vy += g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;

        const age = now - p.born;
        const lifeT = Math.max(0, Math.min(1, age / p.life));
        p.el.style.opacity = String(Math.max(0, 1 - (lifeT * lifeT)));
        p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${p.rot.toFixed(2)}deg)`;

        if (lifeT >= 1 || p.y > (root.clientHeight + 40)) {
          p.el.remove();
          pieces.splice(i, 1);
        }
      }

      if (elapsed < ttl || pieces.length) {
        requestAnimationFrame(frame);
      } else {
        layer.remove();
      }
    }

    requestAnimationFrame(frame);
  }

  function syncDiceBuildLayout(ui) {
    const root = ui?.mgRoot;
    if (!root) return;

    const body = root.querySelector('.mg-body');
    if (!body) {
      root.classList.remove('mg-layout-stack');
      return;
    }

    const minBoard = 560;
    const minSide = 160;
    const shellAllowance = 4;
    const need = minBoard + minSide + shellAllowance;
    const available = Math.max(0, root.clientWidth);
    root.classList.toggle('mg-layout-stack', available < need);
  }

  function render(els, st, helpers) {
    if (!els || !st) return;

    syncDiceBuildLayout(els);
    const shopLocked = !st.shopEnabled;

    if (els.mgStorebar) {
      els.mgStorebar.classList.toggle('is-locked', shopLocked);
    }

    if (els.mgCash) els.mgCash.textContent = String(st.cash);
    if (els.mgStage) els.mgStage.textContent = `Stage ${st.stageIdx + 1}/${STAGE_COUNT}`;
    const { goal, cur } = helpers.fmtGoal(st);
    if (els.mgGoal) els.mgGoal.textContent = `${cur}/${goal}`;
    if (els.mgGoalFill) {
      const pct = goal > 0 ? clamp(Math.round((cur / goal) * 100), 0, 100) : 0;
      els.mgGoalFill.style.width = `${pct}%`;
    }
    if (els.mgRolls) {
      const left = Math.max(0, ROLLS_PER_STAGE - (st.rollInStage || 0));
      els.mgRolls.textContent = `🎲 ${left} left | ${st.totalRolls}/${TOTAL_ROLLS}`;
      const isDanger = left <= 2 && cur < goal;
      els.mgRolls.classList.toggle('is-danger', isDanger);
    }
    renderLastRoll(els, st);

    if (els.mgBoard) {
      els.mgBoard.innerHTML = '';
      const canDragNow = !st.isRolling && !st.isMoving;
      const cols = st.board.cols;
      const rows = st.board.rows;
      const playerCell = st.board.loop[st.playerLoopPos || 0];
      const placed = st.placed || {};
      const now = Date.now();
      const pulseMap = st.fxPulse || {};
      const fxItems = Array.isArray(st.cellFxItems) ? st.cellFxItems.filter((it) => (it.until || 0) > now) : [];
      els.mgBoard.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const cellIdx = idxOf(x, y);
          const t = st.board.tiles.get(cellIdx) || null;
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'mg-cell';
          cell.setAttribute('data-idx', String(cellIdx));
          const inst = placed[String(cellIdx)] || null;
          const isSellArmed = !!st.selected && st.selected.from === 'board' && Number(st.selected.idx) === cellIdx;
          if ((pulseMap[String(cellIdx)] || 0) > now) {
            cell.classList.add('is-fx-pulse');
          }

          if (!t) {
            cell.classList.add('is-void');
            cell.disabled = true;
            cell.textContent = '';
          } else {
            cell.classList.add('is-tile');
            cell.setAttribute('data-kind', t.kind);
            if (t.kind === 'start') {
              cell.classList.add('is-start');
              cell.textContent = 'START';
            } else if (t.kind === 'path') {
              cell.classList.add('is-path');
              cell.textContent = '·';
            } else if (t.kind === 'coin') {
              cell.classList.add('is-coin');
              cell.textContent = '💰';
            } else if (t.kind === 'gift') {
              cell.classList.add('is-gift');
              cell.textContent = '🎁';
            } else if (t.kind === 'locked' || t.kind === 'build_locked') {
              const unlocked = isLockedUsable(st, cellIdx);
              cell.classList.add(unlocked ? 'is-foundation2' : 'is-locked');
              if (!unlocked && st.selectingUnlock) {
                cell.classList.add('is-unlock-target');
              }
              cell.textContent = unlocked ? '' : '🔒';
            } else if (isFoundationKind(t.kind)) {
              cell.classList.add(t.kind === 'foundation2' ? 'is-foundation2' : 'is-foundation');
              cell.textContent = '';
            }

            if (inst) {
              const def = BUILDINGS[inst.defId];
              cell.classList.add('has-building');
              cell.classList.add(rarityClass(def?.rarity));
              if (isSellArmed) cell.classList.add('is-sell-armed');
              cell.draggable = canDragNow;
              if (isSellArmed) {
                cell.innerHTML = '<div class="mg-sell-overlay">SELL</div>';
              } else {
                const isMaxLevel = Number(inst.level || 1) >= 4;
                const req = isMaxLevel ? 16 : expReqForNext(inst.level || 1);
                const curExp = isMaxLevel ? 16 : Math.max(0, Math.round(inst.exp || 0));
                const pct = req > 0 ? clamp(Math.round((curExp / req) * 100), 0, 100) : 0;
                const lvText = isMaxLevel ? 'Lv max' : `Lv${inst.level}`;
                cell.innerHTML = `
                  <div class="mg-bld-ico">${def?.icon || '🏗️'}</div>
                  <div class="mg-bld-exp"><div class="mg-bld-expfill" style="width:${pct}%"></div></div>
                  <div class="mg-bld-lv">${lvText}</div>
                `;
              }
            } else {
              cell.draggable = false;
            }

            if (cellIdx === playerCell) {
              const marker = document.createElement('div');
              marker.className = `mg-player${st.isMoving ? ' is-hop' : ''}`;
              marker.textContent = '🙂';
              cell.appendChild(marker);
            }

            const cellFx = fxItems.filter((it) => Number(it.cellIdx) === cellIdx);
            for (const fx of cellFx) {
              const tag = document.createElement('span');
              tag.className = `mg-cell-gain ${fx.kind === 'exp' ? 'is-exp' : 'is-coins'}`;
              tag.textContent = String(fx.text || '');
              const dur = Math.max(1, Math.round(Number(fx.duration || 820)));
              const born = Number.isFinite(Number(fx.born)) ? Number(fx.born) : (Number(fx.until || now) - dur);
              const age = Math.max(0, now - born);
              const delay = Math.min(dur - 1, age);
              tag.style.animationDuration = `${dur}ms`;
              if (delay > 0) tag.style.animationDelay = `-${delay}ms`;
              cell.appendChild(tag);
            }
          }
          els.mgBoard.appendChild(cell);
        }
      }
    }

    if (els.mgBackpack) {
      els.mgBackpack.innerHTML = '';
      st.backpack.forEach((inst, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mg-pack-slot';
        btn.setAttribute('data-idx', String(idx));
        btn.draggable = !!inst && !st.isRolling && !st.isMoving;
        if (!inst) {
          btn.classList.add('is-empty');
          btn.textContent = 'Empty';
        } else {
          const def = BUILDINGS[inst.defId];
          btn.classList.add(rarityClass(def?.rarity));
          const isSellArmed = !!st.selected && st.selected.from === 'backpack' && Number(st.selected.idx) === idx;
          if (isSellArmed) {
            btn.classList.add('is-sell-armed');
            btn.innerHTML = '<div class="mg-sell-overlay">SELL</div>';
          } else {
            const lvText = Number(inst.level || 1) >= 4 ? 'Lv max' : `Lv${inst.level}`;
            btn.innerHTML = `<div class="mg-slot-ico">${def?.icon || '🏗️'}</div><div class="mg-slot-lv">${lvText}</div>`;
          }
        }
        els.mgBackpack.appendChild(btn);
      });
    }

    if (els.mgStore) {
      els.mgStore.innerHTML = '';
      st.shop.forEach((it) => {
        const soldOut = !!it?.soldOut || !it?.defId;
        const def = soldOut ? null : BUILDINGS[it.defId];
        const rar = soldOut
          ? null
          : (RARITY[def?.rarity || 'common'] || RARITY.common);
        const affordable = soldOut ? false : (st.cash >= it.price);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mg-store-item';
        if (soldOut) btn.classList.add('is-soldout');
        if (!soldOut && !affordable) btn.classList.add('is-cannot-afford');
        if (!soldOut) btn.classList.add(rarityClass(def?.rarity));
        btn.disabled = shopLocked;
        btn.draggable = !shopLocked && !st.isRolling && !st.isMoving && !soldOut;
        btn.setAttribute('data-slot', String(it.slot));
        if (soldOut) {
          btn.innerHTML = '<div class="mg-store-name">SOLD OUT</div>';
        } else {
          const tags = Array.isArray(def?.tags) ? def.tags : [];
          const flow = tags.length ? tags.map((tag) => `${typeEmoji(tag)} ${tag}`).join(' / ') : '—';
          btn.innerHTML = `<div class="mg-store-name">${def?.icon || '🏗️'} ${def?.name || it.defId}</div><div class="mg-store-flow">${flow}</div><div class="mg-store-meta"><span class="mg-dot" style="background:${rar.color}"></span>${rar.label} · 💵 ${it.price}</div>`;
        }
        els.mgStore.appendChild(btn);
      });
    }

    if (els.mgRefreshCost) els.mgRefreshCost.textContent = `(${st.refreshCost})`;
    if (els.mgRefreshBtn) els.mgRefreshBtn.disabled = !st.shopEnabled;
    const nextBlockCost = BUY_BLOCK_COSTS[Math.min(BUY_BLOCK_COSTS.length - 1, Math.max(0, st.unlockedBlocks || 0))] || BUY_BLOCK_COSTS[0];
    if (els.mgBuyBlockCost) els.mgBuyBlockCost.textContent = `(${nextBlockCost})`;
    if (els.mgRollBtn) els.mgRollBtn.disabled = !canRoll(st) || !!st.isRolling;

  }

  return {
    formatBuildingEffect,
    hideHoverCard,
    showHoverCard,
    showBuildingDetail,
    hideBuildingDetail,
    hideResult,
    showResult,
    showFloat,
    playStageClearCelebration,
    syncDiceBuildLayout,
    render,
  };
}
