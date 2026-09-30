-- Drives the computed parts of the v2 matchup locator lower third from its public
-- view model inputs.
--
-- Event title: the tab above the VS panel shows only when eventTitle is not blank.
--
-- Separators: the space between school and mascot, the dot between the overall and
-- conference records and the dot between venue and location each show only when
-- the values on both sides of them are not blank, so a missing mascot, record or
-- location leaves no stray space or dot (a right-aligned home name would otherwise
-- shift by the width of a trailing space).
--
-- The title fades rather than jumps (exponential approach), so an operator can edit
-- the graphic on air. The first frame takes every value directly.

local SETTLE_TIME = 0.07

-- Each separator: the two values it stands between, the private property the scene
-- binds and the text it shows.
local SEPARATORS = {
    { first = 'awaySchool', second = 'awayMascot', output = '_awayMascotGap', text = ' ' },
    { first = 'homeSchool', second = 'homeMascot', output = '_homeMascotGap', text = ' ' },
    { first = 'awayOverallRecord', second = 'awayConferenceRecord', output = '_awayRecordSeparator', text = '  ·  ' },
    { first = 'homeOverallRecord', second = 'homeConferenceRecord', output = '_homeRecordSeparator', text = '  ·  ' },
    { first = 'venueName', second = 'venueLocation', output = '_venueSeparator', text = '   ·   ' },
}

type Eased = { property: Property<number>, target: number }
type Separator = { first: Property<string>, second: Property<string>, output: Property<string>, text: string }
type Controller = {
    eased: {Eased},
    separators: {Separator},
    title: Property<string>?,
    titlePresence: Eased?,
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
    for _, separator in ipairs(self.separators) do
        local shown = not isBlank(separator.first.value) and not isBlank(separator.second.value)
        local wanted = if shown then separator.text else ''
        if separator.output.value ~= wanted then separator.output.value = wanted end
    end

    local title = self.title
    local presence = self.titlePresence
    if title and presence then
        presence.target = if isBlank(title.value) then 0 else 1
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
    for _, entry in ipairs(SEPARATORS) do
        local first = vm:getString(entry.first)
        local second = vm:getString(entry.second)
        local output = vm:getString(entry.output)
        if first and second and output then
            table.insert(self.separators, { first = first, second = second, output = output, text = entry.text })
        end
    end
    self.title = vm:getString('eventTitle')
    local presence = vm:getNumber('_eventTitleOpacity')
    if presence then self.titlePresence = eased(self, presence) end
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
        eased = {}, separators = {}, title = nil, titlePresence = nil,
        init = init, advance = advance,
    }
end
