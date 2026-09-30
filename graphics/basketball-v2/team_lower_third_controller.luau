-- Drives the computed parts of the v2 Team lower third from its public view model inputs.
--
-- Stat cells: a cell shows when its value is not blank. The shown cells share the strip
-- evenly, left to right in input order; a hidden cell fades out in place. Each shown cell
-- but the first draws a divider on its left edge, and the gap between a value and its
-- label is empty when the label is blank.
--
-- Body mode: bodyMode TEXT shows the copy, anything else the stat cells; the two
-- crossfade.
--
-- Changes settle smoothly (exponential approach) rather than jumping, so an operator
-- can edit the graphic on air. The first frame takes every value directly.

local BODY_WIDTH = 684
local CELL_INSET = 12
local CELL_COUNT = 4
local SETTLE_TIME = 0.07
local LABEL_GAP = '  '

type Eased = { property: Property<number>, target: number }
type Cell = {
    value: Property<string>,
    label: Property<string>,
    gap: Property<string>,
    x: Eased,
    width: Eased,
    opacity: Eased,
    divider: Eased,
}
type Controller = {
    cells: {Cell},
    eased: {Eased},
    mode: Property<string>?,
    stats: Eased?,
    copy: Eased?,
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
    local slot = if shown > 0 then BODY_WIDTH / shown else BODY_WIDTH
    local position = 0
    for _, cell in ipairs(self.cells) do
        local wanted = if isBlank(cell.label.value) then '' else LABEL_GAP
        if cell.gap.value ~= wanted then cell.gap.value = wanted end
        if isBlank(cell.value.value) then
            cell.opacity.target = 0
            cell.divider.target = 0
        else
            cell.x.target = position * slot
            cell.width.target = slot - 2 * CELL_INSET
            cell.opacity.target = 1
            cell.divider.target = if position == 0 then 0 else 1
            position += 1
        end
    end

    local mode = self.mode
    local showsCopy = mode ~= nil and string.upper(mode.value) == 'TEXT'
    if self.stats then self.stats.target = if showsCopy then 0 else 1 end
    if self.copy then self.copy.target = if showsCopy then 1 else 0 end
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
        local label = vm:getString(prefix .. 'Label')
        local gap = vm:getString('_' .. prefix .. 'Gap')
        local x = vm:getNumber('_' .. prefix .. 'X')
        local width = vm:getNumber('_' .. prefix .. 'Width')
        local opacity = vm:getNumber('_' .. prefix .. 'Opacity')
        local divider = vm:getNumber('_' .. prefix .. 'Divider')
        if value and label and gap and x and width and opacity and divider then
            table.insert(self.cells, {
                value = value, label = label, gap = gap,
                x = eased(self, x), width = eased(self, width),
                opacity = eased(self, opacity), divider = eased(self, divider),
            })
        end
    end
    self.mode = vm:getString('bodyMode')
    local stats = vm:getNumber('_statsOpacity')
    if stats then self.stats = eased(self, stats) end
    local copy = vm:getNumber('_textOpacity')
    if copy then self.copy = eased(self, copy) end
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
        cells = {}, eased = {}, mode = nil, stats = nil, copy = nil,
        init = init, advance = advance,
    }
end
