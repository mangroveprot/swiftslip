/**
 * What `POST /files` accepts. The route validates it with `fileUploadInput`
 * first, so this mirrors the parsed shape rather than re-declaring rules.
 */
export type FileUploadInput = {
  filename: string;
  contentType: string;
  base64: string;
  entityType?: string | undefined;
  entityId?: string | undefined;
};
