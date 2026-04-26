export type AppBindings = {
  ASSETS: Fetcher;
  RECOGNIZER_ASSETS?: R2Bucket;
  SHEETS: R2Bucket;
  READ_KEY?: string;
  STAGING_BASIC_AUTH?: string;
  UPLOAD_KEY?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
};
