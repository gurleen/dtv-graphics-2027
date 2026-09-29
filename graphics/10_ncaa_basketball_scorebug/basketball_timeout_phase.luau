-- Pure choreography math for the timeout announcement. Isolated from the
-- ScriptedDrawable's Property<T> wiring so it can be unit tested directly.

local BANNER_RISE = 0.28
local BANNER_HOLD = 1.30
local BANNER_FALL = 0.28
local BANNER_TRAVEL = 26

local BLINK_PERIOD = 0.26
local BLINK_DUTY = 0.6
local BLINK_DIM = 0.15

local BANNER_HOLD_END = BANNER_RISE + BANNER_HOLD
local BANNER_TOTAL_DURATION = BANNER_HOLD_END + BANNER_FALL

-- The fourth is the last a team has, so it is announced as such.
local ORDINALS = { 'FIRST', 'SECOND', 'THIRD', 'FINAL' }

export type BannerFrame = { offset: number, bar: number }

-- The banner label names the timeout just taken, counting up from the first.
local function label(taken: number): string
    local ordinal = ORDINALS[taken]
    if ordinal == nil then return 'TIMEOUT' end
    return ordinal .. ' TIMEOUT'
end

-- Evaluates the announcement at `elapsed` seconds into a timeout: the banner
-- rises from behind the team panel, holds while the spent bar blinks, then
-- the bar goes dark and the banner slides back down out of sight.
local function bannerPhase(elapsed: number): BannerFrame
    local offset: number
    if elapsed < BANNER_RISE then
        local raw = math.clamp(elapsed / BANNER_RISE, 0, 1)
        offset = -BANNER_TRAVEL * (1 - (1 - raw) ^ 3)
    elseif elapsed < BANNER_HOLD_END then
        offset = -BANNER_TRAVEL
    elseif elapsed < BANNER_TOTAL_DURATION then
        local raw = math.clamp((elapsed - BANNER_HOLD_END) / BANNER_FALL, 0, 1)
        offset = -BANNER_TRAVEL * (1 - raw ^ 3)
    else
        offset = 0
    end

    local bar: number
    if elapsed < BANNER_HOLD_END then
        bar = if elapsed % BLINK_PERIOD < BLINK_PERIOD * BLINK_DUTY then 1 else BLINK_DIM
    else
        bar = 0
    end

    return { offset = offset, bar = bar }
end

return {
    bannerPhase = bannerPhase,
    label = label,
    totalDuration = BANNER_TOTAL_DURATION,
    riseEnd = BANNER_RISE,
    holdEnd = BANNER_HOLD_END,
    travel = BANNER_TRAVEL,
    blinkPeriod = BLINK_PERIOD,
    blinkDim = BLINK_DIM,
}
