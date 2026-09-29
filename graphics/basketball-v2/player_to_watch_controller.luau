-- Drives the computed parts of the v2 Player to Watch lower third from its public
-- view model inputs.
--
-- Stat tiles: a tile shows when its value is not blank. The shown tiles share the
-- body row evenly, left to right in input order; a hidden tile fades out in place.
--
-- Body mode: bodyMode TEXT shows the copy, anything else the stat tiles; the two
-- crossfade.
--
-- Context: the separator between the title and the context tag shows only when the
-- tag is not blank.
--
-- Changes settle smoothly (exponential approach) rather than jumping, so an operator
-- can edit the graphic on air. The first frame takes every value directly.

local BODY_WIDTH = 1176
local GAP = 4
local CELL_COUNT = 4
local SETTLE_TIME = 0.07
local SEPARATOR = '   /   '

type Eased = { property: Property<number>, target: number }
type Cell = { value: Property<string>, x: Eased, width: Eased, opacity: Eased }
type Controller = {
    cells: {Cell},
    eased: {Eased},
    mode: Property<string>?,
    stats: Eased?,
    copy: Eased?,
    context: Property<string>?,
    separator: Property<string>?,
}

local function isBlank(text: string): boolean
    return string.find(text, '%S') == nil
end

local function eased(self: Controller, property: Property<number>): Eased
    local entry = { property = property, target = property.value }
    table.insert(self.eased, entry)
    return entry
end

local function updateTargets(self: Controller)
    local shown = 0
    for _, cell in ipairs(self.cells) do
        if not isBlank(cell.value.value) then shown += 1 end
    end
    local width = if shown > 0 then (BODY_WIDTH - (shown - 1) * GAP) / shown else BODY_WIDTH
    local slot = 0
    for _, cell in ipairs(self.cells) do
        if isBlank(cell.value.value) then
            cell.opacity.target = 0
        else
            cell.x.target = slot * (width + GAP)
            cell.width.target = width
            cell.opacity.target = 1
            slot += 1
        end
    end

    local mode = self.mode
    local showsCopy = mode ~= nil and string.upper(mode.value) == 'TEXT'
    if self.stats then self.stats.target = if showsCopy then 0 else 1 end
    if self.copy then self.copy.target = if showsCopy then 1 else 0 end

    local context = self.context
    local separator = self.separator
    if context and separator then
        local wanted = if isBlank(context.value) then '' else SEPARATOR
        if separator.value ~= wanted then separator.value = wanted end
    end
end

local function settle(self: Controller, amount: number)
    for _, entry in ipairs(self.eased) do
        local current = entry.property.value
        local remaining = entry.target - current
        if remaining ~= 0 then
            if amount >= 1 or math.abs(remaining) < 0.01 then
                entry.property.value = entry.target
            else
                entry.property.value = current + remaining * amount
            end
        end
    end
end

local function init(self: Controller, context: Context): boolean
    local vm = context:viewModel()
    if vm == nil then return true end
    for index = 1, CELL_COUNT do
        local prefix = 'stat' .. index
        local value = vm:getString(prefix .. 'Value')
        local x = vm:getNumber('_' .. prefix .. 'X')
        local width = vm:getNumber('_' .. prefix .. 'Width')
        local opacity = vm:getNumber('_' .. prefix .. 'Opacity')
        if value and x and width and opacity then
            table.insert(self.cells, {
                value = value, x = eased(self, x), width = eased(self, width), opacity = eased(self, opacity),
            })
        end
    end
    self.mode = vm:getString('bodyMode')
    local stats = vm:getNumber('_statsOpacity')
    if stats then self.stats = eased(self, stats) end
    local copy = vm:getNumber('_textOpacity')
    if copy then self.copy = eased(self, copy) end
    self.context = vm:getString('contextLabel')
    self.separator = vm:getString('_contextSeparator')
    updateTargets(self)
    settle(self, 1)
    return true
end

local function advance(self: Controller, seconds: number): boolean
    updateTargets(self)
    settle(self, 1 - math.exp(-seconds / SETTLE_TIME))
    return true
end

return function(): Node<Controller>
    return {
        cells = {}, eased = {}, mode = nil, stats = nil, copy = nil, context = nil, separator = nil,
        init = init, advance = advance,
    }
end
