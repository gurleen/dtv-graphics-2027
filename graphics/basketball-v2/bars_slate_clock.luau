-- Lays the bars slate's clock out tabular. Zuume has no tnum feature and its digits vary in
-- width, so the clock is one text run per character and each digit is padded to the widest
-- digit's width by its run's letter spacing. Without it the seconds would shift the line
-- sideways as they count.

-- Zuume Bold digit advances in font units (1000 per em), widest last.
local DIGIT_ADVANCE = { [0] = 373, 236, 369, 369, 355, 371, 375, 316, 371, 375 }
local DIGIT_CELL = 375
local CLOCK_SIZE = 62
local CLOCK_TRACKING = 0.5
local SLOTS = 8

type Clock = {
    input: Property<string>, chars: {Property<string>}, spacings: {Property<number>},
    x: Property<number>, shown: string?,
}
type Controller = { clock: Clock? }

-- Half the space a character gives up against a digit cell, in pixels.
local function digitPad(char: string): number
    local digit = tonumber(char)
    if digit == nil or #char ~= 1 then return 0 end
    return (DIGIT_CELL - DIGIT_ADVANCE[digit]) * CLOCK_SIZE / 1000 / 2
end

-- Letter spacing follows a glyph, so each run carries its own glyph's trailing pad and the
-- next glyph's leading pad. Centred text loses half of the first glyph's leading pad, so the
-- text shifts by that.
local function layout(clock: Clock, text: string)
    local count = math.min(#text, SLOTS)
    for i = 1, SLOTS do
        local char = if i < SLOTS then string.sub(text, i, i) else string.sub(text, i)
        clock.chars[i].value = char
        local nextChar = if i < count then string.sub(text, i + 1, i + 1) else ''
        clock.spacings[i].value = CLOCK_TRACKING + digitPad(char) + digitPad(nextChar)
    end
    clock.x.value = digitPad(string.sub(text, 1, 1)) / 2
    clock.shown = text
end

local function init(self: Controller, context: Context): boolean
    local vm = context:viewModel()
    if vm == nil then return true end
    local input = vm:getString('clock')
    local x = vm:getNumber('_clockX')
    local chars, spacings = {}, {}
    for i = 1, SLOTS do
        local char = vm:getString('_clockChar' .. i)
        local spacing = vm:getNumber('_clockSpacing' .. i)
        if char and spacing then
            table.insert(chars, char)
            table.insert(spacings, spacing)
        end
    end
    if input and x and #chars == SLOTS then
        self.clock = { input = input, chars = chars, spacings = spacings, x = x, shown = nil }
    end
    return true
end

local function advance(self: Controller, seconds: number): boolean
    local clock = self.clock
    if clock and clock.input.value ~= clock.shown then
        layout(clock, clock.input.value)
    end
    return true
end

return function(): Node<Controller>
    return { clock = nil, init = init, advance = advance }
end
