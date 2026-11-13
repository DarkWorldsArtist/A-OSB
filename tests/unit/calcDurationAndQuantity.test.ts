import { Time } from '@oldschoolgg/toolkit';
import { describe, expect, test } from 'vitest';

import { calcDurationAndQuantity } from '@/lib/util/minionUtils.js';

describe('calcDurationAndQuantity', () => {
	const singleTime = Time.Minute * 10;
	const maxTripLength = Time.Minute * 30;

	test('defaults to max completions when no duration is provided', () => {
		expect(calcDurationAndQuantity({ singleTime, maxTripLength })).toEqual({
			quantity: 3,
			duration: Time.Minute * 30
		});
	});

	test('rounds to nearest completion', () => {
		expect(calcDurationAndQuantity({ durationInput: '14m', singleTime, maxTripLength })).toEqual({
			quantity: 1,
			duration: Time.Minute * 10
		});
		expect(calcDurationAndQuantity({ durationInput: '16m', singleTime, maxTripLength })).toEqual({
			quantity: 2,
			duration: Time.Minute * 20
		});
	});

	test('clamps to at least 1 completion', () => {
		expect(calcDurationAndQuantity({ durationInput: '1m', singleTime, maxTripLength })).toEqual({
			quantity: 1,
			duration: Time.Minute * 10
		});
	});

	test('caps rounded quantity to maxTripLength', () => {
		expect(
			calcDurationAndQuantity({
				durationInput: '29m',
				singleTime: Time.Minute * 8,
				maxTripLength: Time.Minute * 30
			})
		).toEqual({
			quantity: 3,
			duration: Time.Minute * 24
		});
	});

	test('rejects invalid or over-limit durations', () => {
		expect(typeof calcDurationAndQuantity({ durationInput: 'abc', singleTime, maxTripLength })).toBe('string');
		expect(typeof calcDurationAndQuantity({ durationInput: '0m', singleTime, maxTripLength })).toBe('string');
		expect(typeof calcDurationAndQuantity({ durationInput: '45m', singleTime, maxTripLength })).toBe('string');
	});
});
