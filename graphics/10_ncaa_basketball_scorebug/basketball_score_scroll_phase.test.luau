local phase = require('graphics/10_ncaa_basketball_scorebug/basketball_score_scroll_phase')

return function(): Tests
    return function(test: Tester)
        test.group('celebrationPhase', function()
            test.case('holds the outgoing score at the start of the fade', function(expect)
                local frame = phase.celebrationPhase(0, 68, 71)
                expect(frame.current).is('68')
                expect(frame.offset).is(0)
                expect(frame.alpha).is(1)
                expect(frame.scale).is(1)
            end)

            test.case('the outgoing score has faded out by the end of the fade', function(expect)
                local frame = phase.celebrationPhase(phase.outgoingFadeEnd, 68, 71)
                expect(frame.current).is('68')
                expect(frame.offset).is(-38)
                expect(frame.alpha).is(0)
            end)

            test.case('the badge overshoots past full scale while entering', function(expect)
                local midpoint = phase.outgoingFadeEnd
                    + (phase.badgeEnterEnd - phase.outgoingFadeEnd) * 0.9
                local frame = phase.celebrationPhase(midpoint, 68, 71)
                expect(frame.current).is('+3')
                expect(frame.scale).greaterThan(1)
            end)

            test.case('the badge is fully in and glowing at the end of the entrance', function(expect)
                local frame = phase.celebrationPhase(phase.badgeEnterEnd, 68, 71)
                expect(frame.current).is('+3')
                expect(frame.offset).is(0)
                expect(frame.scale).is(1)
                expect(frame.alpha).is(1)
                expect(frame.glow).is(1)
            end)

            test.case('the badge holds unchanged through the hold phase', function(expect)
                local midpoint = phase.badgeEnterEnd
                    + (phase.badgeHoldEnd - phase.badgeEnterEnd) * 0.5
                local frame = phase.celebrationPhase(midpoint, 68, 71)
                expect(frame.current).is('+3')
                expect(frame.offset).is(0)
                expect(frame.scale).is(1)
                expect(frame.alpha).is(1)
                expect(frame.glow).is(1)
            end)

            test.case('the badge has faded out by the end of its exit', function(expect)
                local frame = phase.celebrationPhase(phase.badgeExitEnd, 68, 71)
                expect(frame.current).is('+3')
                expect(frame.offset).is(-38)
                expect(frame.alpha).is(0)
                expect(frame.glow).is(1)
            end)

            test.case('the incoming score rises from below mid-settle', function(expect)
                local midpoint = phase.badgeExitEnd + (phase.totalDuration - phase.badgeExitEnd) * 0.5
                local frame = phase.celebrationPhase(midpoint, 68, 71)
                expect(frame.current).is('71')
                expect(frame.offset).greaterThan(0)
                expect(frame.alpha).greaterThan(0)
                expect(frame.alpha).lessThan(1)
            end)

            test.case('the incoming score has settled by the end of the timeline', function(expect)
                local frame = phase.celebrationPhase(phase.totalDuration, 68, 71)
                expect(frame.current).is('71')
                expect(frame.offset).is(0)
                expect(frame.alpha).is(1)
                expect(frame.glow).is(0)
            end)
        end)
    end
end
