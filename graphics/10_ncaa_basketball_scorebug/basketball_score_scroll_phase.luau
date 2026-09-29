-- Pure choreography math for the three-point celebration reel. Isolated from
-- the ScriptedDrawable's Property<T> wiring so it can be unit tested directly.

local THREE_OUTGOING_FADE = 0.13
local THREE_BADGE_ENTER = 0.20
local THREE_BADGE_HOLD = 0.22
local THREE_BADGE_EXIT = 0.14
local THREE_INCOMING_SETTLE = 0.30
local THREE_SHIFT_DISTANCE = 38
local THREE_TOTAL_DURATION = THREE_OUTGOING_FADE + THREE_BADGE_ENTER + THREE_BADGE_HOLD
    + THREE_BADGE_EXIT + THREE_INCOMING_SETTLE

export type CelebrationFrame = {
    current: string, offset: number, alpha: number, scale: number, glow: number,
}

-- Penner-style back-out, overshoot scaled to roughly match a GSAP back.out(2).
local function easeOutBack(t: number): number
    local overshoot = 1.70158 * 2
    local x = t - 1
    return 1 + (overshoot + 1) * x * x * x + overshoot * x * x
end

-- Evaluates the celebration reel at `elapsed` seconds into a three-point
-- change from `shown` to `target`. Mirrors the reference GSAP timeline:
-- outgoing fade-up, "+3" badge bounce-in and hold, badge fade-up, then the
-- new total settles in from below.
local function celebrationPhase(elapsed: number, shown: number, target: number): CelebrationFrame
    local enterAt = THREE_OUTGOING_FADE
    local holdAt = enterAt + THREE_BADGE_ENTER
    local exitAt = holdAt + THREE_BADGE_HOLD
    local settleAt = exitAt + THREE_BADGE_EXIT

    if elapsed <= enterAt then
        local eased = math.clamp(elapsed / THREE_OUTGOING_FADE, 0, 1) ^ 2
        return {
            current = tostring(shown), offset = -THREE_SHIFT_DISTANCE * eased,
            alpha = 1 - eased, scale = 1, glow = 0,
        }
    elseif elapsed <= holdAt then
        local eased = easeOutBack(math.clamp((elapsed - enterAt) / THREE_BADGE_ENTER, 0, 1))
        return {
            current = '+3', offset = 0, scale = 0.65 + 0.35 * eased,
            alpha = math.clamp(eased, 0, 1), glow = math.clamp(eased, 0, 1),
        }
    elseif elapsed <= exitAt then
        return { current = '+3', offset = 0, scale = 1, alpha = 1, glow = 1 }
    elseif elapsed <= settleAt then
        local eased = math.clamp((elapsed - exitAt) / THREE_BADGE_EXIT, 0, 1) ^ 2
        return {
            current = '+3', offset = -THREE_SHIFT_DISTANCE * eased,
            alpha = 1 - eased, scale = 1, glow = 1,
        }
    else
        local raw = math.clamp((elapsed - settleAt) / THREE_INCOMING_SETTLE, 0, 1)
        local eased = 1 - (1 - raw) ^ 3
        return {
            current = tostring(target), offset = THREE_SHIFT_DISTANCE * (1 - eased),
            alpha = eased, scale = 1, glow = 1 - eased,
        }
    end
end

return {
    celebrationPhase = celebrationPhase,
    totalDuration = THREE_TOTAL_DURATION,
    outgoingFadeEnd = THREE_OUTGOING_FADE,
    badgeEnterEnd = THREE_OUTGOING_FADE + THREE_BADGE_ENTER,
    badgeHoldEnd = THREE_OUTGOING_FADE + THREE_BADGE_ENTER + THREE_BADGE_HOLD,
    badgeExitEnd = THREE_OUTGOING_FADE + THREE_BADGE_ENTER + THREE_BADGE_HOLD + THREE_BADGE_EXIT,
}
