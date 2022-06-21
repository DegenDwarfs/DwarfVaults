import	React, {ReactElement, useContext, createContext}	from	'react';
import	axios												from	'axios';
import	NProgress											from	'nprogress';
import	{useSettings, useWeb3}								from	'@yearn-finance/web-lib/contexts';
import	{performBatchedUpdates, toAddress}					from	'@yearn-finance/web-lib/utils';
import	{WalletContextApp}									from	'contexts/useWallet';
import type {TToken, TVault, TVaultAPI}						from	'contexts/useYearn.d';

type	TYearnContext = {
	vaults: TVault[],
	nonce: number
}
const	YearnContext = createContext<TYearnContext>({vaults: [], nonce: 0});
export const YearnContextApp = ({children}: {children: ReactElement}): ReactElement => {
	const	{chainID} = useWeb3();
	const	{networks} = useSettings();
	const	[vaults, set_vaults] = React.useState<TVault[]>([]);
	const	[nonce, set_nonce] = React.useState(0);

	const getYearnVaults = React.useCallback(async (): Promise<void> => {
		NProgress.start();
		const	networkData = networks[chainID === 1337 ? 1 : chainID || 1 ];
		const	[api, meta, tok, vs] = await Promise.allSettled([
			axios.get(`${networkData.apiURI}/vaults/all`),
			axios.get(`${networkData.metaURI}/strategies/all`),
			axios.get(`${networkData.metaURI}/tokens/all`),
			axios.get(`${networkData.metaURI}/vaults/all`)
		]);

		let	strategies = [];
		let tokens = [];
		let vaults = [];
		if (api.status === 'rejected') {
			console.error(`failed to fetch vaults: ${api.reason}`);
			return;
		}
		vaults = api.value.data;

		if (meta.status === 'rejected') {
			console.error(`failed to fetch meta: ${meta.reason}`);
		} else {
			strategies = meta.value.data;
		}
		if (tok.status === 'rejected') {
			console.error(`failed to fetch tok: ${tok.reason}`);
		} else {
			tokens = tok.value.data;
		}
		if (vs.status === 'rejected') {
			console.error(`failed to fetch tok: ${vs.reason}`);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			vs.value.data;
		}

		/* 🔵 - Yearn Finance **************************************************
		** Do you want to display all the vaults, or just a selection ?
		** You can use this filter function to add some conditions for the
		** vaults to work with.
		**********************************************************************/
		const	endorsedVaults: {[key: number]: string[]} = {
			1: [
				toAddress('0xd88dBBA3f9c4391Ee46f5FF548f289054db6E51C'), //yvCurve Dola
				toAddress('0x2DfB14E32e2F8156ec15a2c21c3A6c053af52Be8'), //yvCurve MIM
				toAddress('0xE537B5cc158EB71037D4125BDD7538421981E6AA'), //yvCurve TriCrypto
				toAddress('0x718AbE90777F5B778B52D553a5aBaa148DD0dc5D'), //alETH
				toAddress('0x790a60024bC3aea28385b60480f15a0771f26D09'), //yvCurve YFI/ETH
				toAddress('0x1635b506a88fBF428465Ad65d00e8d6B6E5846C3'), //yvCurve CVX/ETH
				toAddress('0x4560b99C904aAD03027B5178CCa81584744AC01f'), // yvCurve CVX/CRV
				toAddress('0xA74d4B67b3368E83797a35382AFB776bAAE4F5C8'), //alUSD
				toAddress('0x5a770DbD3Ee6bAF2802D29a901Ef11501C44797A') //sUSD
						
			],
			250 : [
				toAddress('0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0'), //yvWFTM
				toAddress('0x148c05caf1Bb09B5670f00D511718f733C54bC4c'), //yvUSDT
				toAddress('0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698'), //BOO
				toAddress('0x1e2fe8074a5ce1Bb7394856B0C618E75D823B93b'), //fBEET				
				toAddress('0xCbCaF8cB8cbeAFA927ECEE0c5C56560F83E9B7D9'), //yvCurve TriCrypto
				toAddress('0xA97E7dA01C7047D6a65f894c99bE8c832227a8BC')	//yv3Pool
			],
			42161 : [
				toAddress('0x239e14A19DFF93a17339DCC444f74406C17f8E67'), //yvCurve MIM				
				toAddress('0x1dBa7641dc69188D6086a73B972aC4bda29Ec35d')	//yvCurve TriCrypto
			]
		};
		vaults = vaults.filter((vault: TVaultAPI): boolean => {
			/* 🔵 - Yearn Finance **********************************************
			** If a migration is available, this means it's not the latest
			** vault for this underlying. Skip it for our UI.
			******************************************************************/
			if (vault?.migration?.available) {
				return false;
			}

			/* 🔵 - Yearn Finance **********************************************
			** For this project need, we have a list of 6 vaults we would like
			** to endorse. If the vault's address match one of them, include it
			** in the final list.
			******************************************************************/
			if (endorsedVaults[chainID === 1337 ? 1 : chainID || 1].includes(toAddress(vault.address))) {
				return true;
			}
			return false;
		});

		/* 🔵 - Yearn Finance **************************************************
		** Prepare the return data. We fetched data from the relevant source and
		** filtered the elements we needed. Now we can try to group the data
		** together to have some correct complet data to work with.
		**********************************************************************/
		const	_vaults: TVault[] = [];
		for (const vault of vaults) {
			/* 🔵 - Yearn Finance **********************************************
			** First, let's try to find the description for the underlying
			** token, as provided by meta.yearn.finance.
			******************************************************************/
			vault.description = tokens.find((token: TToken): boolean => (
				toAddress(token.address) === toAddress(vault.token.address)
			))?.description || '';

			/* 🔵 - Yearn Finance **********************************************
			** Then let's do the same for the vault's strategies. The official
			** api.yearn.finance api send us the list of strategies attached to
			** each vault, but without display name or description. Fix it by
			** grouping data with meta.yearn.finance.
			******************************************************************/
			const	_strategies = [];
			for (const strat of vault.strategies) {
				const	stratMeta = strategies.find((s: any): boolean => s.addresses.includes(strat.address));
				if (stratMeta) {
					_strategies.push({
						display_name: stratMeta.name,
						description: stratMeta.description,
						protocols: stratMeta.protocols,
						...strat
					});
				} else {
					_strategies.push(strat);
				}
			}
			vault.strategies = _strategies;

			/* 🔵 - Yearn Finance **********************************************
			** The API may have empty points data for the APY. We don't want
			** our app to get some undefined issue, so we add a fail-safe here
			******************************************************************/
			if (!vault?.apy?.points?.inception) {
				vault.apy.points = {
					week_ago: 0,
					month_ago: 0,
					inception: 0
				};
			}

			/* 🔵 - Yearn Finance **********************************************
			** You need to override, replace, update some other elements? Feel
			** free to put whatever you need here. The idea is to have easy to
			** access accurate data accross your app. For example, let's change
			** some token symbol and add some "type" for the vaults.
			******************************************************************/
			if (vault.token.symbol === 'yDAI+yUSDC+yUSDT+yBUSD')
				vault.token.symbol = 'yBUSD';
			if (vault.token.symbol === 'yDAI+yUSDC+yUSDT+yTUSD')
				vault.token.symbol = 'yCRV';
			if (vault.token.symbol === 'cDAI+cUSDC+USDT')
				vault.token.symbol = 'cUSDT';

			vault.categories = ['simple_saver'];
			vault.chainID = chainID;
			if (chainID === 1 || chainID === 1337) {
				if(toAddress(vault.address) === toAddress('0xd88dBBA3f9c4391Ee46f5FF548f289054db6E51C'))
					vault.categories = ['usd_stable'];
				if(toAddress(vault.address) === toAddress('0x2DfB14E32e2F8156ec15a2c21c3A6c053af52Be8'))
					vault.categories = ['usd_stable'];	
				if(toAddress(vault.address) === toAddress('0xE537B5cc158EB71037D4125BDD7538421981E6AA'))
					vault.categories = ['simple_saver', 'blue_chip'];	
				if(toAddress(vault.address) === toAddress('0x718AbE90777F5B778B52D553a5aBaa148DD0dc5D'))
					vault.categories = ['simple_saver'];
				if(toAddress(vault.address) === toAddress('0x790a60024bC3aea28385b60480f15a0771f26D09'))
					vault.categories = ['simple_saver','blue_chip'];
				if(toAddress(vault.address) === toAddress('0x1635b506a88fBF428465Ad65d00e8d6B6E5846C3'))
					vault.categories = ['simple_saver','blue_chip'];	
				if(toAddress(vault.address) === toAddress('0x4560b99C904aAD03027B5178CCa81584744AC01f'))
					vault.categories = ['simple_saver','blue_chip'];	
				if(toAddress(vault.address) === toAddress('0xA74d4B67b3368E83797a35382AFB776bAAE4F5C8'))
					vault.categories = ['usd_stable'];	
				if(toAddress(vault.address) === toAddress('0x5a770DbD3Ee6bAF2802D29a901Ef11501C44797A'))
					vault.categories = ['usd_stable'];																																																
			} else if (chainID === 250) {
				if (toAddress(vault.address) === toAddress('0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0')) //yvWFTM
					vault.categories = ['simple_saver', 'blue_chip'];
				if (toAddress(vault.address) === toAddress('0x148c05caf1Bb09B5670f00D511718f733C54bC4c')) //yvUSDT
					vault.categories = ['simple_saver', 'usd_stable'];
				if(toAddress(vault.address) === toAddress('0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698')) //BOO
					vault.categories = ['simple_saver', 'blue_chip'];
				if(toAddress(vault.address) === toAddress('0x1e2fe8074a5ce1Bb7394856B0C618E75D823B93b')) //fBEET
					vault.categories = ['simple_saver'];					
				if(toAddress(vault.address) === toAddress('0xCbCaF8cB8cbeAFA927ECEE0c5C56560F83E9B7D9')) //yvCurveTricrypto
					vault.categories = ['simple_saver','blue_chip'];
				if(toAddress(vault.address) === toAddress('0xA97E7dA01C7047D6a65f894c99bE8c832227a8BC'))
					vault.categories = ['simple_saver', 'usd_stable'];
			
			} else if (chainID === 42161) {
				if(toAddress(vault.address) === toAddress('0x239e14A19DFF93a17339DCC444f74406C17f8E67'))
					vault.categories = ['simple_saver', 'blue_chip'];	
				if(toAddress(vault.address) === toAddress('0x1dBa7641dc69188D6086a73B972aC4bda29Ec35d'))
					vault.categories = ['simple_saver','usd_stable'];							
												
			}

			_vaults.push(vault);
		}

		performBatchedUpdates((): void => {
			set_vaults(_vaults);
			set_nonce((n): number => n + 1);
			NProgress.done();
		});
	}, [chainID, networks]);

	React.useEffect((): void => {
		getYearnVaults();
	}, [getYearnVaults]);

	return (
		<YearnContext.Provider value={{vaults, nonce}}>
			<WalletContextApp vaults={vaults}>
				{children}
			</WalletContextApp>
		</YearnContext.Provider>
	);
};


export const useYearn = (): TYearnContext => useContext(YearnContext);
export default useYearn;
