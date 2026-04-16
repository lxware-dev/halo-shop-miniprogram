type NamedMessageResolver = (key: string) => unknown;

interface NamedMessageContext {
  named: NamedMessageResolver;
}

export function defineNamedMessage(formatter: (named: NamedMessageResolver) => string) {
  return ({ named }: NamedMessageContext) => formatter(named);
}

export type LocaleMessageValue = string | ReturnType<typeof defineNamedMessage>;
