# Common Setup & Startup Problems

This document collects recurring setup and startup issues observed across different operating systems
and environments, along with their causes and proven solutions.

If you encounter a startup failure that is not explained in the **README**, check this file first.

---

## 1. Backend startup fails due to a deprecated JVM timezone during JDBC handshake

### Symptoms

Backend fails during startup with an error similar to:

```text
FATAL: invalid value for parameter "TimeZone": "Asia/Calcutta"
```

This typically occurs before Hibernate initializes and may be followed by secondary errors related to JDBC metadata or schema validation.

### Cause

During the initial JDBC connection handshake, the PostgreSQL JDBC driver propagates the JVM’s default timezone as a startup parameter.

On some OS / JDK combinations (notably Windows and certain Linux setups),
the JVM defaults to the deprecated timezone identifier such as:

```text
Asia/Calcutta
```

Recent PostgreSQL versions reject this value in favor of the modern IANA identifier:

```text
Asia/Kolkata
```

Because the failure happens during connection negotiation, Hibernate never obtains
JDBC metadata, causing cascading startup failures.

**Notes:**

- This happens before any SQL queries are executed

- ```hibernate.jdbc.time_zone``` does not affect JDBC startup parameters

- Root cause is the **JVM → JDBC → PostgreSQL** handshake

### Solution

As of this fix, the backend pins the JVM default timezone to **UTC** itself at startup
(`BackendApplication.pinDefaultTimeZone()`), before any JDBC connection is opened. This removes
the dependency on the host's tzdata, so the error above should no longer occur regardless of how
the backend is launched (`mvnw`, IDE run config, packaged jar).

If you still hit this (e.g. on an older checkout, or after pulling without rebuilding), the manual
workarounds below still apply:

**Option 1: Explicitly set JVM timezone**

Pass a valid timezone identifier via JVM arguments. Using **UTC** is the safest way to ensure consistency across environments.

```bash
-Duser.timezone=UTC
```

Example using Maven wrapper:

```bash
./mvnw "-Dspring-boot.run.jvmArguments=-Duser.timezone=UTC" spring-boot:run
```

This is PowerShell-safe and works consistently across platforms.

**Option 2: Ensure system timezone uses a valid IANA identifier**

Verify that your OS timezone is set to a modern IANA value:
```text
Asia/Kolkata
UTC
```
Then restart the backend.

**Need a non-UTC default?** Set the `APP_TIMEZONE` environment variable (e.g. `APP_TIMEZONE=Asia/Kolkata`).
It is honored both by `pinDefaultTimeZone()` and by `hibernate.jdbc.time_zone`, so the two stay in sync.

---

## Adding new problems

When documenting a new issue, please follow this structure:

- **Symptoms** (exact error messages)

- **Cause** (why it happens)

- **Solution** (clear, actionable steps)
