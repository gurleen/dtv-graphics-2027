-- Returns the gap that precedes a statistic's muted detail (the 42.9% after 12-28),
-- or nothing when the detail is blank, so a statistic without a detail stays centred.

local SEPARATOR = '  '

type DetailSeparator = {}

local function convert(self: DetailSeparator, input: DataValueString): DataValueString
    local output: DataValueString = DataValue.string()
    local detail = string.match(input.value, '^%s*(.-)%s*$') or ''
    output.value = if detail == '' then '' else SEPARATOR
    return output
end

local function reverseConvert(self: DetailSeparator, input: DataValueString): DataValueString
    return input
end

return function(): Converter<DetailSeparator, DataValueString, DataValueString>
    return { convert = convert, reverseConvert = reverseConvert }
end
