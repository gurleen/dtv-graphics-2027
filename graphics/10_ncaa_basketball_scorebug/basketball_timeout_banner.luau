-- Drives the timeout announcement for both sides. A drop in a side's timeout
-- count raises a banner from behind that team's panel naming the timeout just
-- taken; the bar being spent blinks while the banner is up, then goes dark as
-- the banner slides back down.
--
-- The four bars' opacities are owned here rather than by a range mapper on the
-- count, because the spent bar has to outlive the count that lit it.
local phase = require('graphics/10_ncaa_basketball_scorebug/basketball_timeout_phase')

local BARS = 4

type Side = {
    input: Property<number>, offset: Property<number>, label: Property<string>,
    bars: { Property<number> }, mirrored: boolean,
    lit: number, blinking: number, elapsed: number,
}
type Controller = { sides: {Side} }

-- Both sides spend their timeouts from the outside in, so the home bars, which
-- read away from the centre, deplete left to right: the nth timeout remaining
-- is the nth bar from the right.
local function barAt(side: Side, remaining: number): number
    if side.mirrored then return BARS + 1 - remaining end
    return remaining
end

local function count(value: number): number
    if value ~= value or math.abs(value) == math.huge then return 0 end
    return math.clamp(math.floor(value), 0, BARS)
end

-- `blink` is the opacity of the bar being spent; every other bar is simply lit
-- or dark according to the count the side has settled on.
local function applyBars(side: Side, blink: number)
    for index, bar in ipairs(side.bars) do
        if index == side.blinking then
            bar.value = blink
        elseif barAt(side, index) <= side.lit then
            bar.value = 1
        else
            bar.value = 0
        end
    end
end

local function init(self: Controller, context: Context): boolean
    local vm = context:viewModel()
    if vm == nil then return true end
    self.sides = {}
    for _, name in ipairs({'away', 'home'}) do
        local mirrored = name == 'home'
        local input = vm:getNumber(name .. 'Timeouts')
        local offset = vm:getNumber('_' .. name .. 'BannerOffset')
        local label = vm:getString('_' .. name .. 'BannerLabel')
        local bars: { Property<number> } = {}
        for index = 1, BARS do
            local bar = vm:getNumber('_' .. name .. 'Timeout' .. tostring(index))
            if bar then table.insert(bars, bar) end
        end
        if input and offset and label and #bars == BARS then
            local side: Side = {
                input = input, offset = offset, label = label, bars = bars, mirrored = mirrored,
                lit = count(input.value), blinking = 0, elapsed = phase.totalDuration,
            }
            offset.value = 0
            applyBars(side, 0)
            table.insert(self.sides, side)
        end
    end
    return true
end

local function advance(self: Controller, seconds: number): boolean
    for _, side in ipairs(self.sides) do
        if side.elapsed >= phase.totalDuration then
            local requested = count(side.input.value)
            if requested < side.lit then
                -- The last timeout remaining is the one spent, so it is the one that blinks.
                side.blinking = barAt(side, side.lit)
                side.label.value = phase.label(BARS - requested)
                side.lit = requested
                side.elapsed = 0
            elseif requested ~= side.lit then
                -- Restored timeouts light up without an announcement.
                side.lit = requested
                applyBars(side, 0)
            end
        end
        if side.elapsed < phase.totalDuration then
            side.elapsed = math.min(phase.totalDuration, side.elapsed + seconds)
            local frame = phase.bannerPhase(side.elapsed)
            side.offset.value = frame.offset
            applyBars(side, frame.bar)
            if side.elapsed >= phase.totalDuration then
                side.blinking = 0
                side.offset.value = 0
                applyBars(side, 0)
            end
        end
    end
    return true
end

return function(): Node<Controller>
    return { sides = {}, init = init, advance = advance }
end
