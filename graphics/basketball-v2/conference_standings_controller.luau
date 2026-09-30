-- Drives the computed parts of the v2 Conference Standings card from its public view model
-- inputs.
--
-- Rows: each row names a team (rowNTeam). The controller finds that team in the roster,
-- the `_teamN` properties the generator writes from conference_teams.ts, and gives the
-- row the team's logo. A row whose team is not in the roster (blank, say) hides its logo.
--
-- Game night: a row whose team is awayTeam or homeTeam takes that team's tint. A row keeps
-- its tint colour while the tint fades out, so a team change does not flash the new
-- team's colour.
--
-- Names match without regard to case or surrounding spaces. Changes settle smoothly
-- (exponential approach) rather than jumping, so an operator can edit the card on air.
-- The first frame takes every value directly.

local SETTLE_TIME = 0.07

type Eased = { property: Property<number>, target: number }
type Member = { name: string, color: Property<Color>, logo: Property<Image> }
type Row = {
    team: Property<string>,
    logo: Property<Image>,
    color: Property<Color>,
    highlight: Eased,
    logoOpacity: Eased,
    -- The members whose logo and tint colour the row last took.
    shown: Member?,
    tinted: Member?,
}
type Controller = {
    members: {Member},
    rows: {Row},
    eased: {Eased},
    away: Property<string>?,
    home: Property<string>?,
}

local function normalized(text: string): string
    return string.upper(string.match(text, '^%s*(.-)%s*$') or '')
end

local function eased(self: Controller, property: Property<number>): Eased
    local entry = { property = property, target = property.value }
    table.insert(self.eased, entry)
    return entry
end

local function memberNamed(self: Controller, name: string): Member?
    if name == '' then return nil end
    for _, member in ipairs(self.members) do
        if member.name == name then return member end
    end
    return nil
end

local function updateTargets(self: Controller)
    local awayProperty = self.away
    local homeProperty = self.home
    local away = if awayProperty then normalized(awayProperty.value) else ''
    local home = if homeProperty then normalized(homeProperty.value) else ''
    for _, row in ipairs(self.rows) do
        local name = normalized(row.team.value)
        local member = memberNamed(self, name)
        local playing = member ~= nil and (name == away or name == home)
        if member and member ~= row.shown then
            row.logo.value = member.logo.value
            row.shown = member
        end
        if playing and member and member ~= row.tinted then
            row.color.value = member.color.value
            row.tinted = member
        end
        row.logoOpacity.target = if member then 1 else 0
        row.highlight.target = if playing then 1 else 0
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
    self.members = {}
    self.rows = {}
    self.eased = {}
    local index = 1
    while true do
        local prefix = '_team' .. index
        local name = vm:getString(prefix .. 'Name')
        local color = vm:getColor(prefix .. 'Color')
        local logo = vm:getImage(prefix .. 'Logo')
        if not (name and color and logo) then break end
        table.insert(self.members, { name = normalized(name.value), color = color, logo = logo })
        index += 1
    end
    index = 1
    while true do
        local prefix = 'row' .. index
        local team = vm:getString(prefix .. 'Team')
        local logo = vm:getImage('_' .. prefix .. 'Logo')
        local color = vm:getColor('_' .. prefix .. 'Color')
        local highlight = vm:getNumber('_' .. prefix .. 'Highlight')
        local logoOpacity = vm:getNumber('_' .. prefix .. 'LogoOpacity')
        if not (team and logo and color and highlight and logoOpacity) then break end
        table.insert(self.rows, {
            team = team, logo = logo, color = color,
            highlight = eased(self, highlight), logoOpacity = eased(self, logoOpacity),
            shown = nil, tinted = nil,
        })
        index += 1
    end
    self.away = vm:getString('awayTeam')
    self.home = vm:getString('homeTeam')
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
        members = {}, rows = {}, eased = {}, away = nil, home = nil,
        init = init, advance = advance,
    }
end
