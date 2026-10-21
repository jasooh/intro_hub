import Image from "next/image";
import sentFrom from "../../public/images/etransfer-sent-from.png";

/**
 * Where players find the name their bank sends from: a real e-Transfer
 * notification with the "Sent From" name marked up in the site's style.
 * Used under "Name on your e-Transfers" on the profile form.
 */
export function EtransferNameExample() {
  return (
    <figure className="space-y-3">
      <Image
        src={sentFrom}
        alt="An Interac e-Transfer email. Under Transfer Details, the name below “Sent From” is boxed in orange with a label: Put this name."
        sizes="(min-width: 640px) 28rem, 100vw"
        className="h-auto w-full max-w-md border-2 border-ink shadow-[4px_4px_0_var(--ink)]"
      />
      <figcaption className="space-y-2 text-sm text-ink-soft">
        <span className="block">
          Open any e-Transfer email you&apos;ve sent and look under <b className="text-ink">Sent From</b> in Transfer
          Details. Type that name exactly, usually in capitals. Not sure? Send one to yourself or a friend.
        </span>
        <span className="block">
          <b className="text-ink">Don&apos;t stress about it:</b> putting your <span className="font-score font-black text-ink">VB-</span>{" "}
          code in the e-Transfer message is what matches your payment. This name is a backup for when the code gets left
          out or mistyped.
        </span>
      </figcaption>
    </figure>
  );
}
