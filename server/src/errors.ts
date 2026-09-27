/** An error whose message is safe to show the user (written in Uzbek Latin). */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
