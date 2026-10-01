# Microsoft

Use the Microsoft Calendar and mailbox Adapters with a configured Microsoft account.

The Extension includes a public native OAuth App labeled `ctxindex`, so
`ctxindex account add microsoft` can start the provider-direct loopback flow
without local App setup. The public application id is not a secret; tokens and
account data stay in the local ctxindex secret backend and database.

Publisher verification, tenant consent, and account-type policy can still
affect authorization. This documentation does not claim that every Microsoft
tenant or account has approved the App. To use your own Microsoft registration
instead, import it and select its exact label:

```sh
ctxindex oauth-app add microsoft <label> --from-env
ctxindex account add microsoft --app <label>
```
