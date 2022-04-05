import axios from 'axios';

const configMap = new Map();

/**
 *
 * @todo Cache config map so it doesn't have to re-call site-config
 * @param pathPattern
 * @param domainConfig
 * @returns
 */
export const translatePathPattern = async (
	pathPattern: string,
	domainConfig: string = 'odb'
): Promise<string> => {
	return new Promise(async resolve => {
		if (!configMap.has(domainConfig)) {
			let response = await getSiteConfig(domainConfig);
			configMap.set(domainConfig, response.data.routes);
		}

		const routes = configMap.get(domainConfig);

		for (let route in routes) {
			let clean = route.replace('/', '');
			if (pathPattern.includes(clean)) {
				pathPattern = pathPattern.replace(
					clean,
					routes[route].replace('/', '')
				);
			}
		}

		resolve(pathPattern);
	});
};

/**
 *
 * @param config
 */
const getSiteConfig = (config: string, stage?: string) => {
	if (stage && stage !== 'prod ') {
		return axios.get(
			`https://${stage}.crouton.odb.org/site-config?override=${config}`
		);
	}
	return axios.get(`https://crouton.odb.org/site-config?override=${config}`);
};
