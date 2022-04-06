import {
	AllowedMethods,
	BehaviorOptions,
	CacheCookieBehavior,
	CacheHeaderBehavior,
	CachePolicy,
	CacheQueryStringBehavior,
	EdgeLambda,
	ICachePolicy,
	LambdaEdgeEventType,
	ViewerProtocolPolicy,
	OriginRequestPolicy,
	IOrigin,
} from 'aws-cdk-lib/aws-cloudfront';

import * as iam from 'aws-cdk-lib/aws-iam';

// import { DatabaseCluster, DatabaseClusterEngine} from 'aws-cdk-lib/aws-rds';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Duration } from 'aws-cdk-lib';

import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

import { Construct } from 'constructs';
import * as path from 'path';

export interface WPCachePolicies {
	apiCachePolicy: CachePolicy;
	homePageCachePolicy: CachePolicy;
	staticCachePolicy: CachePolicy;
	noCachePolicy: CachePolicy;
	defaultCachePolicy: CachePolicy;
}

import crypto from 'crypto';

const wordpressCookies = [
	'comment_author_*',
	'jetpack*',
	'jpp*',
	'test_case',
	'woocommerce_*',
	'wordpress_*',
	'wp*',
];

const wordPressHeaders = [
	'Authorization',
	'Cloudfront-Viewer-Country',
	'Cloudfront-Viewer-Time-Zone',
	'Host',
	'X-Time-Zone',
	'X-Country',
	'HTTP_X_TIME_ZONE',
	'HTTP_X_COUNTRY',
	'Origin',
];

let edgeFunction: NodejsFunction;

const getEdgeFunction = (name: string, scope: Construct) => {
	if (!edgeFunction) {
		edgeFunction = new NodejsFunction(
			scope,
			name + 'WpEdge' + crypto.randomUUID(),
			{
				entry: path.resolve(__dirname, `lambda/${name}/${name}.js`),
				handler: 'handler',
				// depsLockFilePath: path.resolve(__dirname, `lambda/${name}/package-lock.json`)`,
				logRetention: RetentionDays.ONE_MONTH,
				awsSdkConnectionReuse: false,
				functionName: name + 'wpEdgeFn',
				description: 'Deployed on: ' + new Date().toISOString(),
				memorySize: 128,
				role: new iam.Role(scope, 'AllowLambdaServiceToAssumeRole' + name, {
					assumedBy: new iam.CompositePrincipal(
						new iam.ServicePrincipal('lambda.amazonaws.com'),
						new iam.ServicePrincipal('edgelambda.amazonaws.com')
					),
					managedPolicies: [
						ManagedPolicy.fromAwsManagedPolicyName(
							'service-role/AWSLambdaBasicExecutionRole'
						),
					],
				}),
			}
		);
	}

	return edgeFunction;
};

const getBehaviors = (scope: Construct, origin: IOrigin) => {
	const {
		apiCachePolicy,
		homePageCachePolicy,
		staticCachePolicy,
		noCachePolicy,
	} = getCachePolicies(scope, 'WordPress');

	return {
		defaultBehavior: generateBehavior(scope, origin, noCachePolicy, true, true),
		additionalBehaviors: {
			'/wp-content/*': generateBehavior(
				scope,
				origin,
				staticCachePolicy,
				false,
				false
			),
			'/wp-includes/css/*': generateBehavior(
				scope,
				origin,
				staticCachePolicy,
				false,
				false
			),
			'/wp-includes/js/*': generateBehavior(
				scope,
				origin,
				staticCachePolicy,
				false,
				false
			),
			'/': generateBehavior(scope, origin, homePageCachePolicy, true),
			'/content/*': generateBehavior(scope, origin, noCachePolicy, true, true),
			'/wp-json/*': generateBehavior(scope, origin, apiCachePolicy, true),
			'/wp-login.php': generateBehavior(
				scope,
				origin,
				noCachePolicy,
				false,
				true
			),
			'/wp-admin/*': generateBehavior(scope, origin, noCachePolicy, true, true),
		},
	};
};

export const generateBehavior = (
	scope: Construct,
	origin: IOrigin,
	cachePolicy: ICachePolicy,
	withLambda = false,
	allowAll = true
): BehaviorOptions => {
	let lambdas: EdgeLambda[] = [];

	if (withLambda) {
		lambdas = [
			{
				eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
				functionVersion: getEdgeFunction('countryTimezoneHeaders', scope)
					.currentVersion,
			},
		];
	}

	let behavior: BehaviorOptions = {
		origin,
		cachePolicy,
		originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
	};
	if (withLambda) {
		behavior = {
			...behavior,
			allowedMethods: AllowedMethods.ALLOW_ALL,
			viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
			edgeLambdas: lambdas,
		};
	}

	if (allowAll) {
		behavior = {
			...behavior,
			allowedMethods: AllowedMethods.ALLOW_ALL,
			viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
		};
	}

	return behavior;
};

export const getCachePolicies = (scope: Construct, name: string) => {
	const scopedName = (text: string) => {
		return `${text}-${name}`.split('.').join('_');
	};
	const noCachePolicy = new CachePolicy(scope, scopedName('NoCachey'), {
		// cachePolicyName: scopedName('WordPressNoCache'),
		cookieBehavior: CacheCookieBehavior.all(),
		minTtl: Duration.minutes(1),
		maxTtl: Duration.minutes(1),
		defaultTtl: Duration.minutes(1),
		headerBehavior: CacheHeaderBehavior.none(),
		queryStringBehavior: CacheQueryStringBehavior.none(),
	});

	const defaultCachePolicy = new CachePolicy(
		scope,
		scopedName('WordPressDefaultCache'),
		{
			cachePolicyName: scopedName('WordPressDefaultCache'),
			cookieBehavior: CacheCookieBehavior.all(),
			minTtl: Duration.minutes(0),
			maxTtl: Duration.minutes(1),
			defaultTtl: Duration.minutes(1),
			headerBehavior: CacheHeaderBehavior.allowList(...wordPressHeaders),
			queryStringBehavior: CacheQueryStringBehavior.all(),
			enableAcceptEncodingBrotli: true,
			enableAcceptEncodingGzip: true,
		}
	);

	const staticCachePolicy = new CachePolicy(scope, scopedName('Static'), {
		cachePolicyName: scopedName('WordPressStatic'),
		cookieBehavior: CacheCookieBehavior.none(),
		minTtl: Duration.hours(1),
		maxTtl: Duration.days(1),
		defaultTtl: Duration.hours(1),
		headerBehavior: CacheHeaderBehavior.allowList('Host'),
		queryStringBehavior: CacheQueryStringBehavior.allowList('file'),
		enableAcceptEncodingBrotli: true,
		enableAcceptEncodingGzip: true,
	});

	const apiCachePolicy = new CachePolicy(scope, scopedName('Api'), {
		cachePolicyName: scopedName('WordPressAPI'),
		cookieBehavior: CacheCookieBehavior.allowList(...wordpressCookies),
		minTtl: Duration.hours(0),
		maxTtl: Duration.hours(1),
		defaultTtl: Duration.hours(1),
		headerBehavior: CacheHeaderBehavior.allowList(...wordPressHeaders),
		queryStringBehavior: CacheQueryStringBehavior.all(),
		enableAcceptEncodingBrotli: true,
		enableAcceptEncodingGzip: true,
	});

	const homePageCachePolicy = new CachePolicy(scope, scopedName('Home'), {
		cachePolicyName: scopedName('WordPressHome'),
		cookieBehavior: CacheCookieBehavior.allowList(...wordpressCookies),
		minTtl: Duration.minutes(5),
		maxTtl: Duration.hours(3),
		defaultTtl: Duration.hours(3),
		headerBehavior: CacheHeaderBehavior.allowList(...wordPressHeaders),
		queryStringBehavior: CacheQueryStringBehavior.all(),
		enableAcceptEncodingBrotli: true,
		enableAcceptEncodingGzip: true,
	});

	return {
		apiCachePolicy,
		homePageCachePolicy,
		staticCachePolicy,
		noCachePolicy,
		defaultCachePolicy,
	};
};
