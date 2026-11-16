import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "fixtures/demo-site/**", "analyzer/**"] },
  ...next,
];

export default config;
