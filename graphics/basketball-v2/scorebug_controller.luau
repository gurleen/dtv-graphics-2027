-- Drives the computed parts of the v2 scorebug from its public view model inputs.
--
-- Score change: the row flashes bright and the new score rolls up from below.
-- The shown score holds until its roll finishes; changes during a roll are
-- coalesced to the latest value and rolled in afterwards.
--
-- Shot clock: at 5 seconds or fewer the red alert cell fades in and pulses once
-- per second, and the digits pulse with it.

local ROLL_DURATION = 0.42
local ROLL_DISTANCE = 64
local FLASH_RISE = 0.06
local FLASH_DECAY = 0.55
local ALERT_THRESHOLD = 5
local ALERT_FADE = 0.2
local PULSE_PERIOD = 1.0
local PULSE_SCALE = 0.08

type Reel = {
    input: Property<number>, shown: Property<string>, incoming: Property<string>,
    roll: Property<number>, flash: Property<number>,
    value: number, target: number, elapsed: number, flashElapsed: number,
}
type ShotClock = {
    input: Property<string>, alert: Property<number>, pulse: Property<number>,
    level: number, phase: number,
}
type Controller = { reels: {Reel}, shotClock: ShotClock? }

local function wholeScore(value: number): number
    if value ~= value or math.abs(value) == math.huge then return 0 end
    return math.max(0, math.floor(value))
end

-- Cubic ease-out: quick departure, visible settle.
local function easeOut(t: number): number
    local inverse = 1 - t
    return 1 - inverse * inverse * inverse
end

local function flashLevel(elapsed: number): number
    if elapsed < FLASH_RISE then return elapsed / FLASH_RISE end
    local t = math.min(1, (elapsed - FLASH_RISE) / FLASH_DECAY)
    return (1 - t) * (1 - t)
end

local function init(self: Controller, context: Context): boolean
    local vm = context:viewModel()
    if vm == nil then return true end
    for _, side in ipairs({'away', 'home'}) do
        local input = vm:getNumber(side .. 'Score')
        local shown = vm:getString('_' .. side .. 'Shown')
        local incoming = vm:getString('_' .. side .. 'Incoming')
        local roll = vm:getNumber('_' .. side .. 'Roll')
        local flash = vm:getNumber('_' .. side .. 'Flash')
        if input and shown and incoming and roll and flash then
            local initial = wholeScore(input.value)
            shown.value = tostring(initial)
            incoming.value = tostring(initial)
            roll.value = 0
            flash.value = 0
            table.insert(self.reels, {
                input = input, shown = shown, incoming = incoming, roll = roll, flash = flash,
                value = initial, target = initial,
                elapsed = ROLL_DURATION, flashElapsed = FLASH_RISE + FLASH_DECAY,
            })
        end
    end
    local shotInput = vm:getString('shotClock')
    local alert = vm:getNumber('_shotAlert')
    local pulse = vm:getNumber('_shotPulse')
    if shotInput and alert and pulse then
        alert.value = 0
        pulse.value = 1
        self.shotClock = { input = shotInput, alert = alert, pulse = pulse, level = 0, phase = 0 }
    end
    return true
end

local function advanceReel(reel: Reel, seconds: number)
    if reel.elapsed >= ROLL_DURATION then
        local requested = wholeScore(reel.input.value)
        if requested ~= reel.value then
            reel.target = requested
            reel.incoming.value = tostring(requested)
            reel.elapsed = 0
            reel.flashElapsed = 0
        end
    end
    if reel.elapsed < ROLL_DURATION then
        reel.elapsed = math.min(ROLL_DURATION, reel.elapsed + seconds)
        reel.roll.value = -ROLL_DISTANCE * easeOut(reel.elapsed / ROLL_DURATION)
        if reel.elapsed >= ROLL_DURATION then
            reel.value = reel.target
            reel.shown.value = tostring(reel.value)
            reel.roll.value = 0
        end
    end
    if reel.flashElapsed < FLASH_RISE + FLASH_DECAY then
        reel.flashElapsed = math.min(FLASH_RISE + FLASH_DECAY, reel.flashElapsed + seconds)
        reel.flash.value = flashLevel(reel.flashElapsed)
    end
end

local function advanceShotClock(shot: ShotClock, seconds: number)
    local remaining = tonumber(shot.input.value)
    local alerting = remaining ~= nil and remaining >= 0 and remaining <= ALERT_THRESHOLD
    local step = seconds / ALERT_FADE
    if alerting then
        shot.level = math.min(1, shot.level + step)
        shot.phase = (shot.phase + seconds / PULSE_PERIOD) % 1
    else
        shot.level = math.max(0, shot.level - step)
        if shot.level == 0 then shot.phase = 0 end
    end
    -- Peaks at the start of each period, so the pulse lands as the digit changes.
    local beat = 0.5 + 0.5 * math.cos(shot.phase * 2 * math.pi)
    shot.alert.value = shot.level * (0.7 + 0.3 * beat)
    shot.pulse.value = 1 + PULSE_SCALE * beat * shot.level
end

local function advance(self: Controller, seconds: number): boolean
    for _, reel in ipairs(self.reels) do
        advanceReel(reel, seconds)
    end
    local shot = self.shotClock
    if shot then
        advanceShotClock(shot, seconds)
    end
    return true
end

return function(): Node<Controller>
    return { reels = {}, shotClock = nil, init = init, advance = advance }
end
