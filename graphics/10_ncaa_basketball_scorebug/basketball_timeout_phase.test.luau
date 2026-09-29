local phase = require('graphics/10_ncaa_basketball_scorebug/basketball_timeout_phase')

return function(): Tests
    return function(test: Tester)
        test.group('label', function()
            test.case('names the timeout by the order it was taken', function(expect)
                expect(phase.label(1)).is('FIRST TIMEOUT')
                expect(phase.label(3)).is('THIRD TIMEOUT')
            end)

            test.case('announces the last timeout as the final one', function(expect)
                expect(phase.label(4)).is('FINAL TIMEOUT')
            end)

            test.case('falls back to a bare label past the named ordinals', function(expect)
                expect(phase.label(9)).is('TIMEOUT')
            end)
        end)

        test.group('bannerPhase', function()
            test.case('starts hidden behind the panel', function(expect)
                expect(phase.bannerPhase(0).offset).is(0)
            end)

            test.case('is fully raised by the end of the rise', function(expect)
                expect(phase.bannerPhase(phase.riseEnd).offset).is(-phase.travel)
            end)

            test.case('holds at full height while the bar blinks', function(expect)
                local midpoint = phase.riseEnd + (phase.holdEnd - phase.riseEnd) * 0.5
                expect(phase.bannerPhase(midpoint).offset).is(-phase.travel)
            end)

            test.case('blinks the spent bar between lit and dim', function(expect)
                expect(phase.bannerPhase(0).bar).is(1)
                expect(phase.bannerPhase(phase.blinkPeriod * 0.9).bar).is(phase.blinkDim)
                expect(phase.bannerPhase(phase.blinkPeriod).bar).is(1)
            end)

            test.case('darkens the spent bar once the hold ends', function(expect)
                expect(phase.bannerPhase(phase.holdEnd).bar).is(0)
            end)

            test.case('slides back down out of sight by the end', function(expect)
                local midpoint = phase.holdEnd + (phase.totalDuration - phase.holdEnd) * 0.5
                local frame = phase.bannerPhase(midpoint)
                expect(frame.offset).lessThan(0)
                expect(frame.offset).greaterThan(-phase.travel)
                expect(phase.bannerPhase(phase.totalDuration).offset).is(0)
            end)
        end)
    end
end
