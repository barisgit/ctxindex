# Google

Use the Google Calendar and Gmail Adapters with a configured Google account.

The Extension includes a public desktop OAuth App labeled `ctxindex`, so
`ctxindex account add google` can start the provider-direct loopback flow
without local App setup. The registration metadata is public; tokens and
account data stay in the local ctxindex secret backend and database.

Google verification and scope approval remain pending.
The provider may show an unverified warning or reject an account or requested
scope. This documentation does not claim production verification. To use your
own Google registration instead, import it and select its exact label:

```sh
ctxindex oauth-app add google <label> --from-env
ctxindex account add google --app <label>
```
