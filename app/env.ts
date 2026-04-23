export type AppBindings = {
  SHEETS: R2Bucket;
  READ_KEY?: string;
  UPLOAD_KEY?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
};
