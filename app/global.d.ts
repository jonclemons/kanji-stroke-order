import type {} from "hono";

type Head = {
  title?: string;
};

declare module "hono" {
  interface ContextRenderer {
    (content: string | Promise<string>, head?: Head): Response | Promise<Response>;
  }
}

interface Navigator {
  connection?: {
    saveData?: boolean;
  };
  standalone?: boolean;
}

interface Window {
  tf?: any;
  tflite?: any;
}

export {};
