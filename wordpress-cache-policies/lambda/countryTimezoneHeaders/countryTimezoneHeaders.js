'use strict';

const aws = require('aws-sdk');
var tzOffset = require('tz-offset');
// Set the region

exports.handler = (event, context, callback) => {
	aws.config.update({ region: 'us-east-1' });
	const docClient = new aws.DynamoDB.DocumentClient();
	const request = event.Records[0].cf.request;
	const reqHeaders = request.headers;
	try {
		if (reqHeaders['cloudfront-viewer-country']) {
			reqHeaders['http_x_country'] = [
				{
					key: 'HTTP_X_COUNTRY',
					value: reqHeaders['cloudfront-viewer-country'][0].value,
				},
			];
			reqHeaders['x-country'] = [
				{
					key: 'X-Country',
					value: reqHeaders['cloudfront-viewer-country'][0].value,
				},
			];
		} else {
			const config = event.Records[0].cf.config;
			console.log(
				`cloudfront-viewer-country not found in ${config.distributionId} for event ${config.eventType} on path ${request.uri}`
			);
			reqHeaders['http_x_country'] = [{ key: 'HTTP_X_COUNTRY', value: 'US' }];
			reqHeaders['x-country'] = [{ key: 'X-Country', value: 'US' }];
		}

		if (reqHeaders['cloudfront-viewer-time-zone']) {
			const tz = reqHeaders['cloudfront-viewer-time-zone'][0].value;

			const timeZoneOffset = (tzOffset.offsetOf(tz) / 60) * -1;
			const lead = Math.floor(timeZoneOffset);

			let leadStr = lead.toString().padStart(2, '0');

			if (lead > 0) {
				leadStr = `+${leadStr}:`;
			} else {
				leadStr = `${leadStr}:`;
			}

			const minutes = ((timeZoneOffset % 1) * 60).toString().padStart(2, '0');

			const tzString = leadStr + minutes;

			reqHeaders['http_x_time_zone'] = [
				{
					key: 'HTTP_X_TIME_ZONE',
					value: tzString,
				},
			];
			reqHeaders['x-time-zone'] = [
				{
					key: 'X-Time-Zone',
					value: tzString,
				},
			];
		} else {
			const config = event.Records[0].cf.config;
			console.log(
				`cloudfront-viewer-country not found in ${config.distributionId} for event ${config.eventType} on path ${request.uri}`
			);
			reqHeaders['http_x_country'] = [{ key: 'HTTP_X_COUNTRY', value: 'US' }];
			reqHeaders['x-country'] = [{ key: 'X-Country', value: 'US' }];
		}

		callback(null, request);
	} catch (error) {
		console.error(
			'An error occurred doing callback to allow request to continue',
			error
		);
		callback(null, request);
	}
};
