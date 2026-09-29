-- Each side retains its outgoing value until the roll finishes. Changes during
-- a roll are coalesced to the latest input, then rolled in without a visual jump.
--
-- A three-point change interrupts the roll with a badge celebration: the
-- outgoing score fades up and off, a gold "+3" badge bounces in and holds,
-- then fades up and off in turn, and the incoming score settles in from below.
local phase = require('graphics/10_ncaa_basketball_scorebug/basketball_score_scroll_phase')

local DURATION = 0.225
local DISTANCE = 96

type Reel = {
    input: Property<number>, current: Property<string>, incoming: Property<string>,
    offset: Property<number>, glow: Property<number>, alpha: Property<number>, scale: Property<number>,
    shown: number, target: number, elapsed: number, duration: number, three: boolean,
}
type Controller = { reels: {Reel} }

local function score(value: number): number
    if value ~= value or math.abs(value) == math.huge then return 0 end
    return math.max(0, math.floor(value))
end

local function init(self: Controller, context: Context): boolean
    local vm = context:viewModel()
    if vm == nil then return true end
    self.reels = {}
    for _, side in ipairs({'away', 'home'}) do
        local input = vm:getNumber(side .. 'Score')
        local current = vm:getString('_' .. side .. 'Current')
        local incoming = vm:getString('_' .. side .. 'Next')
        local offset = vm:getNumber('_' .. side .. 'Offset')
        local glow = vm:getNumber('_' .. side .. 'Glow')
        local alpha = vm:getNumber('_' .. side .. 'Alpha')
        local scale = vm:getNumber('_' .. side .. 'Scale')
        if input and current and incoming and offset and glow and alpha and scale then
            local initial = score(input.value)
            current.value = tostring(initial)
            incoming.value = tostring(initial)
            offset.value = 0
            glow.value = 0
            alpha.value = 1
            scale.value = 1
            table.insert(self.reels, {
                input = input, current = current, incoming = incoming, offset = offset,
                glow = glow, alpha = alpha, scale = scale, shown = initial, target = initial,
                elapsed = DURATION, duration = DURATION, three = false,
            })
        end
    end
    return true
end

local function advance(self: Controller, seconds: number): boolean
    for _, reel in ipairs(self.reels) do
        if reel.elapsed >= reel.duration then
            local requested = score(reel.input.value)
            if requested ~= reel.shown then
                reel.target = requested
                reel.three = requested - reel.shown == 3
                reel.duration = if reel.three then phase.totalDuration else DURATION
                reel.incoming.value = tostring(requested)
                reel.elapsed = 0
            end
        end
        if reel.elapsed < reel.duration then
            reel.elapsed = math.min(reel.duration, reel.elapsed + seconds)
            local elapsed = reel.elapsed
            if reel.three then
                local frame = phase.celebrationPhase(elapsed, reel.shown, reel.target)
                reel.current.value = frame.current
                reel.offset.value = frame.offset
                reel.alpha.value = frame.alpha
                reel.scale.value = frame.scale
                reel.glow.value = frame.glow
            else
                -- Quintic smoothstep: zero velocity and acceleration at both ends.
                local t = math.min(1, elapsed / DURATION)
                local eased = t * t * t * (t * (t * 6 - 15) + 10)
                reel.offset.value = -DISTANCE * eased
            end
            if reel.elapsed >= reel.duration then
                reel.shown = reel.target
                reel.current.value = tostring(reel.shown)
                reel.offset.value = 0
                reel.alpha.value = 1
                reel.scale.value = 1
                reel.glow.value = 0
            end
        end
    end
    return true
end

return function(): Node<Controller>
    return { reels = {}, init = init, advance = advance }
end
