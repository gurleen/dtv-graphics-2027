-- Returns the separator that precedes a conference record, or nothing when the
-- record is blank, so an overall-only record line carries no dangling dot.

local SEPARATOR = '  ·  '

type RecordSeparator = {}

local function convert(self: RecordSeparator, input: DataValueString): DataValueString
    local output: DataValueString = DataValue.string()
    local record = string.match(input.value, '^%s*(.-)%s*$') or ''
    output.value = if record == '' then '' else SEPARATOR
    return output
end

local function reverseConvert(self: RecordSeparator, input: DataValueString): DataValueString
    return input
end

return function(): Converter<RecordSeparator, DataValueString, DataValueString>
    return { convert = convert, reverseConvert = reverseConvert }
end
