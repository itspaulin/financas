import type { ConfigContext, ExpoConfig } from 'expo/config';

// Native builds call the API at a fixed origin (the EAS Hosting deploy). It comes from APP_ORIGIN
// so app.json stays environment-free; see the build profiles in eas.json.
export default ({ config }: ConfigContext): ExpoConfig => {
  const origin = process.env.APP_ORIGIN;
  const building = Boolean(process.env.EAS_BUILD);
  if (building && (!origin || origin.includes('SEU-APP'))) {
    throw new Error('APP_ORIGIN is not set: put the EAS Hosting URL in the build profile env in eas.json.');
  }
  return {
    ...(config as ExpoConfig),
    plugins: (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-router' && origin ? ['expo-router', { ...plugin[1], origin }] : plugin,
    ),
  };
};
