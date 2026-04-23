export type AppBindings = {
  ASSETS: Fetcher;
  SHEETS: R2Bucket;
  READ_KEY?: string;
  UPLOAD_KEY?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
};
