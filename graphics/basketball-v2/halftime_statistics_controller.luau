-- Marks the leading team in each row of the v2 Halftime Statistics card from its
-- public view model inputs.
--
-- Comparison: a row compares its details (42.9% against 48.1%) when both hold a
-- number, and its values otherwise; the figure in a text is its first number, so
-- 12-28 compares as 12. The row's leadingValue says which figure leads: HIGHER (the
-- default), LOWER (turnovers), or NONE, which marks neither team. A tie, or a figure
-- that does not parse, also marks neither. The score row always compares the scores,
-- the higher leading.
--
-- Mark: the leading team's cell takes its tint through the _-prefixed lead opacities.
-- Changes settle smoothly (exponential approach) rather than jumping, so an update
-- on air crossfades the mark. The first frame takes every value directly.

local ROW_COUNT = 6
local SETTLE_TIME = 0.07

type Eased = { property: Property<number>, target: number }
type Comparison = {
    away: Property<string>,
    home: Property<string>,
    awayDetail: Property<string>?,
    homeDetail: Property<string>?,
    leadingValue: Property<string>?,
    awayLead: Eased,
    homeLead: Eased,
}
type Controller = { comparisons: {Comparison}, eased: {Eased} }

local function figure(text: string): number?
    local digits = string.match(text, '%d*%.?%d+')
    return if digits then tonumber(digits) else nil
end

-- 1 when the higher figure leads, -1 when the lower does, 0 when neither is marked.
local function sense(comparison: Comparison): number
    local setting = comparison.leadingValue
    if setting == nil then return 1 end
    local value = string.upper(string.match(setting.value, '^%s*(.-)%s*$') or '')
    if value == 'LOWER' then return -1 end
    if value == 'NONE' then return 0 end
    return 1
end

local function eased(self: Controller, property: Property<number>): Eased
    local entry = { property = property, target = property.value }
    table.insert(self.eased, entry)
    return entry
end

local function updateTargets(self: Controller)
    for _, comparison in ipairs(self.comparisons) do
        local away: number? = nil
        local home: number? = nil
        local awayDetail = comparison.awayDetail
        local homeDetail = comparison.homeDetail
        if awayDetail and homeDetail then
            away = figure(awayDetail.value)
            home = figure(homeDetail.value)
        end
        if away == nil or home == nil then
            away = figure(comparison.away.value)
            home = figure(comparison.home.value)
        end
        local direction = sense(comparison)
        local awayLeads = false
        local homeLeads = false
        if away ~= nil and home ~= nil and away ~= home and direction ~= 0 then
            awayLeads = (away - home) * direction > 0
            homeLeads = not awayLeads
        end
        comparison.awayLead.target = if awayLeads then 1 else 0
        comparison.homeLead.target = if homeLeads then 1 else 0
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
    for index = 1, ROW_COUNT do
        local prefix = 'row' .. index
        local away = vm:getString(prefix .. 'AwayValue')
        local home = vm:getString(prefix .. 'HomeValue')
        local awayLead = vm:getNumber('_' .. prefix .. 'AwayLeadOpacity')
        local homeLead = vm:getNumber('_' .. prefix .. 'HomeLeadOpacity')
        if away and home and awayLead and homeLead then
            table.insert(self.comparisons, {
                away = away,
                home = home,
                awayDetail = vm:getString(prefix .. 'AwayDetail'),
                homeDetail = vm:getString(prefix .. 'HomeDetail'),
                leadingValue = vm:getString(prefix .. 'LeadingValue'),
                awayLead = eased(self, awayLead),
                homeLead = eased(self, homeLead),
            })
        end
    end
    local awayScore = vm:getString('awayScore')
    local homeScore = vm:getString('homeScore')
    local awayScoreLead = vm:getNumber('_awayScoreLeadOpacity')
    local homeScoreLead = vm:getNumber('_homeScoreLeadOpacity')
    if awayScore and homeScore and awayScoreLead and homeScoreLead then
        table.insert(self.comparisons, {
            away = awayScore,
            home = homeScore,
            awayDetail = nil,
            homeDetail = nil,
            leadingValue = nil,
            awayLead = eased(self, awayScoreLead),
            homeLead = eased(self, homeScoreLead),
        })
    end
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
    return { comparisons = {}, eased = {}, init = init, advance = advance }
end
