-- Drives the computed parts of the v2 scorebug from its public view model inputs.
--
-- Score change: the row flashes bright and the new score rolls up from below.
-- The shown score holds until its roll finishes; changes during a roll are
-- coalesced to the latest value and rolled in afterwards.
--
-- Shot clock: at 5 seconds or fewer the red alert cell fades in and pulses once
-- per second.
--
-- Game and shot clocks: tabular figures. Zuume has no tnum feature and its
-- digits vary in width, so each clock is split into one text run per character
-- and each digit is padded to the widest digit's width by its run's letter
-- spacing.

local ROLL_DURATION = 0.42
local ROLL_DISTANCE = 64
local FLASH_RISE = 0.06
local FLASH_DECAY = 0.55
local ALERT_THRESHOLD = 5
local ALERT_FADE = 0.2
local PULSE_PERIOD = 1.0

-- Zuume Bold digit advances in font units (1000 per em), widest last.
local DIGIT_ADVANCE = { [0] = 373, 236, 369, 369, 355, 371, 375, 316, 371, 375 }
local DIGIT_CELL = 375
local CLOCK_SIZE = 62
local CLOCK_TRACKING = 0.5
local GAME_CLOCK_SLOTS = 5
local SHOT_CLOCK_SLOTS = 2

type Reel = {
    input: Property<number>, shown: Property<string>, incoming: Property<string>,
    roll: Property<number>, flash: Property<number>,
    value: number, target: number, elapsed: number, flashElapsed: number,
}
type ShotAlert = { input: Property<string>, alert: Property<number>, level: number, phase: number }
type TabularClock = {
    input: Property<string>, chars: {Property<string>}, spacings: {Property<number>},
    x: Property<number>, shown: string?,
}
type Controller = { reels: {Reel}, shotAlert: ShotAlert?, clocks: {TabularClock} }

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

-- Half the space a character gives up against a digit cell, in pixels.
local function digitPad(char: string): number
    local digit = tonumber(char)
    if digit == nil or #char ~= 1 then return 0 end
    return (DIGIT_CELL - DIGIT_ADVANCE[digit]) * CLOCK_SIZE / 1000 / 2
end

-- Letter spacing follows a glyph, so each run carries its own glyph's trailing
-- pad and the next glyph's leading pad. The first glyph's leading pad has no
-- run before it; centred text loses half of it, so the text shifts by that.
local function layoutClock(clock: TabularClock, text: string)
    local slots = #clock.chars
    local count = math.min(#text, slots)
    for i = 1, slots do
        local char = if i < slots then string.sub(text, i, i) else string.sub(text, i)
        clock.chars[i].value = char
        local nextChar = if i < count then string.sub(text, i + 1, i + 1) else ''
        clock.spacings[i].value = CLOCK_TRACKING + digitPad(char) + digitPad(nextChar)
    end
    clock.x.value = digitPad(string.sub(text, 1, 1)) / 2
    clock.shown = text
end

-- The clock's runs are `_<prefix>Char<n>`, spaced by `_<prefix>Spacing<n>`,
-- and its text is shifted by `_<prefix>X`.
local function bindClock(vm: ViewModel, inputName: string, prefix: string, slots: number): TabularClock?
    local input = vm:getString(inputName)
    local x = vm:getNumber('_' .. prefix .. 'X')
    local chars, spacings = {}, {}
    for i = 1, slots do
        local char = vm:getString('_' .. prefix .. 'Char' .. i)
        local spacing = vm:getNumber('_' .. prefix .. 'Spacing' .. i)
        if char and spacing then
            table.insert(chars, char)
            table.insert(spacings, spacing)
        end
    end
    if input == nil or x == nil or #chars ~= slots then return nil end
    return { input = input, chars = chars, spacings = spacings, x = x, shown = nil }
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
    if shotInput and alert then
        alert.value = 0
        self.shotAlert = { input = shotInput, alert = alert, level = 0, phase = 0 }
    end
    local gameClock = bindClock(vm, 'clock', 'clock', GAME_CLOCK_SLOTS)
    if gameClock then table.insert(self.clocks, gameClock) end
    local shotClock = bindClock(vm, 'shotClock', 'shot', SHOT_CLOCK_SLOTS)
    if shotClock then table.insert(self.clocks, shotClock) end
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

local function advanceShotAlert(shot: ShotAlert, seconds: number)
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
end

local function advance(self: Controller, seconds: number): boolean
    for _, reel in ipairs(self.reels) do
        advanceReel(reel, seconds)
    end
    local shot = self.shotAlert
    if shot then
        advanceShotAlert(shot, seconds)
    end
    for _, clock in ipairs(self.clocks) do
        if clock.input.value ~= clock.shown then
            layoutClock(clock, clock.input.value)
        end
    end
    return true
end

return function(): Node<Controller>
    return { reels = {}, shotAlert = nil, clocks = {}, init = init, advance = advance }
end
